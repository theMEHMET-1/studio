'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision';
import {
  calculateEAR,
  distance,
  angleBetween,
  midpoint,
} from './utils.js';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Settings, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

let faceLandmarker: FaceLandmarker;
let poseLandmarker: PoseLandmarker;
let drawingUtils: DrawingUtils;
let lastVideoTime = -1;
let animationFrameId: number;

// Blink detection constants
let EYE_ASPECT_RATIO_THRESHOLD = 0.3;
const BLINK_CONSECUTIVE_FRAMES = 1;
const LOOKINGMAX = 2.2;
const LOOKINGMIN = 0.5;

let blinkCounter = 0;
let isBlinking = false;
let blinkTimestamps: number[] = [];

export function WebcamFocus() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(
    null
  );
  const [focusScore, setFocusScore] = useState(100);
  const { toast } = useToast();

  const [hasWarned, setHasWarned] = useState(false);
  const [hasCriticalWarned, setHasCriticalWarned] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const criticalAudioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef(Date.now());
  const [isStarted, setIsStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showStats, setShowStats] = useState(false);

  // New state to manage the initial detection grace period
  const isFirstDetection = useRef(true);

  const GRACE_PERIOD_MS = 30000;
  const AUDIO_URL = 'https://files.catbox.moe/6mqp49.mp3';
  const CRITICAL_AUDIO_URL = 'https://files.catbox.moe/8vd1ej.mp3';

  // State for real-time indicators and session statistics
  const [blinksPerMinute, setBlinksPerMinute] = useState(0);
  const [isSlouching, setIsSlouching] = useState(false);
  const [isNotLooking, setIsNotLooking] = useState(false);
  const [sessionScores, setSessionScores] = useState<number[]>([]);
  const [sessionBlinkRates, setSessionBlinkRates] = useState<number[]>([]);

  // State for final session stats
  const [averageScore, setAverageScore] = useState(0);
  const [averageBlinks, setAverageBlinks] = useState(0);

  // State for settings
  const [settings, setSettings] = useState({
    scoreThreshold: 70,
    criticalScoreThreshold: 20,
    minBlinks: 5,
    maxBlinks: 15,
    slouchPenalty: 0.05,
    notLookingPenalty: 0.05,
    blinkPenalty: 0.05,
    EAR: 0.175,
  });

  // Local state for dialog inputs, now as strings
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(AUDIO_URL);
    }
    if (!criticalAudioRef.current) {
      criticalAudioRef.current = new Audio(CRITICAL_AUDIO_URL);
    }
  }, []);

  useEffect(() => {
    const createLandmarkers = async () => {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
      );
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          delegate: 'GPU',
        },
        outputFaceBlendshapes: true,
        runningMode: 'VIDEO',
        numFaces: 1,
      });
      poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
    };
    createLandmarkers();
  }, []);

  useEffect(() => {
    if (focusScore < settings.criticalScoreThreshold && !hasCriticalWarned && isStarted) {
      if (criticalAudioRef.current && !isMuted) {
        criticalAudioRef.current.play().catch((e) => console.error('Critical audio playback failed:', e));
      }
      toast({
        variant: 'destructive',
        title: 'Warning! Low Score!',
        description: `Seems like you're having a hard time focusing right now. Consider taking a break.`,
      });
      setHasCriticalWarned(true);
      setHasWarned(true); // Also set the regular warning to true to prevent it from firing
    } else if (focusScore < settings.scoreThreshold && !hasWarned && !hasCriticalWarned && isStarted) {
      if (audioRef.current && !isMuted) {
        audioRef.current.play().catch((e) => console.error('Audio playback failed:', e));
      }
      toast({
        variant: 'destructive',
        title: 'Alert! Eyes & Posture Check!',
        description: `Your score has dropped to ${Math.round(focusScore)}%`,
      });
      setHasWarned(true);
    } else if (focusScore >= settings.scoreThreshold && hasWarned) {
      setHasWarned(false);
      setHasCriticalWarned(false); // Also reset critical warning
    }
  }, [focusScore, hasWarned, hasCriticalWarned, toast, settings.scoreThreshold, settings.criticalScoreThreshold, isMuted, isStarted]);

  const stopWebcam = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      const tracks = stream.getTracks();
      tracks.forEach((track) => track.stop());
    }
    cancelAnimationFrame(animationFrameId);
    lastVideoTime = -1;
    setIsStarted(false);
  };

  const endWebcam = () => {
    stopWebcam();
    
    // Calculate and display stats
    if (sessionScores.length > 0) {
      const avgScore = sessionScores.reduce((a, b) => a + b, 0) / sessionScores.length;
      setAverageScore(Math.round(avgScore));
    } else {
      setAverageScore(0);
    }

    if (sessionBlinkRates.length > 0) {
      const avgBlinks =
        sessionBlinkRates.reduce((a, b) => a + b, 0) / sessionBlinkRates.length;
      setAverageBlinks(Math.round(avgBlinks));
    } else {
      setAverageBlinks(0);
    }

    setShowStats(true);
  };

  const startNewSession = () => {
    stopWebcam();
    setShowStats(false);
    setFocusScore(100);
    setSessionScores([]);
    setSessionBlinkRates([]);
    setHasWarned(false);
    setHasCriticalWarned(false);
    blinkTimestamps = [];
    blinkCounter = 0;
    isBlinking = false;
    // Resetting these states is the key to fixing the bug
    setIsSlouching(false);
    setIsNotLooking(false);
    isFirstDetection.current = true; // Resetting the first detection flag
    startWebcam();
  };

  const startWebcam = async () => {
    stopWebcam(); // Explicitly stop any existing sessions before starting a new one
    setIsStarted(true);
    setShowStats(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setHasCameraPermission(false);
      toast({
        variant: 'destructive',
        title: 'Camera Not Supported',
        description: 'Your browser does not support camera access.',
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      setHasCameraPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadeddata = () => {
          setTimeout(() => { // Add a small delay to ensure the stream is fully ready
            predictWebcam();
          }, 500);
        };
      }
      if (canvasRef.current) {
        drawingUtils = new DrawingUtils(canvasRef.current.getContext('2d')!);
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setHasCameraPermission(false);
      toast({
        variant: 'destructive',
        title: 'Camera Access Denied',
        description:
          'Please enable camera permissions in your browser settings to use this feature.',
      });
    }
  };

  const predictWebcam = () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !faceLandmarker ||
      !poseLandmarker
    ) {
      animationFrameId = requestAnimationFrame(predictWebcam);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d')!;

    // Check if the video has new data before processing
    if (video.currentTime === lastVideoTime) {
      animationFrameId = requestAnimationFrame(predictWebcam);
      return;
    }

    lastVideoTime = video.currentTime;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const faceResults = faceLandmarker.detectForVideo(video, performance.now());
    const poseResults = poseLandmarker.detectForVideo(video, performance.now());

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    let currentFocusPenalty = 0;
    let isSlouchingNow = false;
    let isNotLookingNow = false;
    isBlinking = false;
    let hasValidResults = false;

    if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
      hasValidResults = true;
      isFirstDetection.current = false; // A valid face detection has occurred
      const landmarks = faceResults.faceLandmarks[0];

      const leftEAR = calculateEAR(landmarks, [33, 160, 158, 133, 153, 144]);
      const rightEAR = calculateEAR(landmarks, [
        362, 385, 387, 263, 373, 380,
      ]);
      const avgEAR = (leftEAR + rightEAR) / 2;

      if (avgEAR < settings.EAR) {
        blinkCounter++;
      } else {
        if (blinkCounter >= BLINK_CONSECUTIVE_FRAMES) {
          isBlinking = true;
          blinkTimestamps.push(Date.now());
        }
        blinkCounter = 0;
      }

      const now = Date.now();
      blinkTimestamps = blinkTimestamps.filter(
        (timestamp) => now - timestamp < 30000
      );
      const blinksPerMinute = blinkTimestamps.length;
      setBlinksPerMinute(blinksPerMinute);
      setSessionBlinkRates((prev) => [...prev, blinksPerMinute]);

      if (now - startTimeRef.current > GRACE_PERIOD_MS) {
        if (blinksPerMinute < settings.minBlinks || blinksPerMinute > settings.maxBlinks) {
          currentFocusPenalty += settings.blinkPenalty;
        }
      }

      const noseDif = distance(landmarks[8], landmarks[0])*100 - distance(landmarks[7], landmarks[0])*100
      if (noseDif > LOOKINGMAX || noseDif < LOOKINGMIN) {
        currentFocusPenalty += settings.notLookingPenalty;
        isNotLookingNow = true;
      }
      setIsNotLooking(isNotLookingNow);

      // Draw face landmarks
      drawingUtils.drawConnectors(
        landmarks,
        FaceLandmarker.FACE_LANDMARKS_TESSELATION,
        { color: '#C0C0C070', lineWidth: 1 }
      );

      const eyeColor = isBlinking ? '#FF0000' : '#30FF30';
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, {
        color: eyeColor,
      });
      drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, {
        color: eyeColor,
      });
    }

    if (poseResults.landmarks && poseResults.landmarks.length > 0) {
      hasValidResults = true;
      isFirstDetection.current = false; // A valid pose detection has occurred
      const bodylandmarks = poseResults.landmarks[0];
      const midpointarray = midpoint(bodylandmarks[11], bodylandmarks[12]);

      const angle = angleBetween(
        bodylandmarks[0],
        midpointarray[0],
        midpointarray[1],
        midpointarray[0],
        midpointarray[1] - 1
      );

      if (angle > 15) {
        currentFocusPenalty += settings.slouchPenalty;
        isSlouchingNow = true;
      }

      setIsSlouching(isSlouchingNow);

      // Draw pose landmarks
      drawingUtils.drawConnectors(bodylandmarks, PoseLandmarker.POSE_CONNECTIONS);
      drawingUtils.drawLandmarks(bodylandmarks, {
        color: isSlouchingNow ? '#FF0000' : '#00FF00',
        radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
      });
    }

    canvasCtx.restore();

    // Only update score if we have valid results from both models
    if (!hasValidResults) {
      // If no valid results, do not update score and continue
      animationFrameId = requestAnimationFrame(predictWebcam);
      return;
    }
    

    setFocusScore(prevScore => {
        if (poseResults.landmarks.length == 0){
          setSessionScores((prev) => [...prev, prevScore - 0.01]);
          return prevScore - 0.01;
        }
        if (currentFocusPenalty > 0) {
          setSessionScores((prev) => [...prev, Math.max(0, prevScore - currentFocusPenalty)]);

          return Math.max(0, prevScore - currentFocusPenalty);
        }
        setSessionScores((prev) => [...prev, prevScore + 0.025]);

        return Math.min(100, prevScore + 0.025);
      });
    


    animationFrameId = requestAnimationFrame(predictWebcam);
  };

  const getPerformanceComment = (score: number) => {
    if (score >= 90)
      return 'Excellent! You maintained great focus and posture throughout the session.';
    if (score >= 75)
      return 'Nice job! You were focused most of the time, with only minor dips.';
    if (score >= 50)
      return "Good effort. There's room for improvement in maintaining focus and posture.";
    return 'Oh no! You may want to check your posture and get some rest.';
  };

  return (
    <div className="w-full max-w-2xl mt-8 flex flex-col items-center gap-8">
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted">
            <video ref={videoRef} className="w-full h-full object-cover" autoPlay muted playsInline />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            {hasCameraPermission === false && (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <Alert variant="destructive" className="w-auto">
                  <AlertTitle>Camera Access Required</AlertTitle>
                  <AlertDescription>
                    Please allow camera access to use this feature.
                  </AlertDescription>
                </Alert>
              </div>
            )}
            {!isStarted && !showStats && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/50">
                <Button onClick={startWebcam}>Start Webcam Session</Button>
              </div>
            )}
            {showStats && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-white/90 dark:bg-black/90 text-center">
                <div className="space-y-4">
                  <h2 className="text-2xl font-bold">Session Stats</h2>
                  <p>
                    <strong>Average Score:</strong> {averageScore}%
                  </p>
                  <p>
                    <strong>Average Blinks Per 30s:</strong> {averageBlinks}
                  </p>
                  <p className="max-w-xs mx-auto mt-4">
                    {getPerformanceComment(averageScore)}
                  </p>
                  <Button onClick={startNewSession}>Start New Session</Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!showStats && (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Focus Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Progress value={focusScore} className="w-full" />
              <span className="text-2xl font-bold">{Math.round(focusScore)}%</span>
            </div>
            <div className="mt-4 space-y-2 text-sm">
              <p>
                <strong>Blinks Per 30s:</strong> {blinksPerMinute}
              </p>
              <p>
                <strong>Posture:</strong>{' '}
                {isSlouching ? (
                  <span className="text-red-500">Slouching</span>
                ) : (
                  <span className="text-green-500">Good</span>
                )}
              </p>
              <p>
                <strong>Looking at Screen:</strong>{' '}
                {isNotLooking ? (
                  <span className="text-red-500">No</span>
                ) : (
                  <span className="text-green-500">Yes</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-4 mt-4">
        {isStarted && (
          <Button variant="outline" onClick={endWebcam} className="hover:bg-red-400 hover:text-white">
            <X className="mr-2 h-4 w-4" />
            End Session
          </Button>
        )}
        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              const newSettings = { ...localSettings };
              const updatedSettings: Record<string, number> = {};

              for (const key in newSettings) {
                const value = newSettings[key as keyof typeof newSettings];
                const numValue = parseFloat(value);
                if (value.trim() !== '' && !isNaN(numValue)) {
                  updatedSettings[key] = numValue;
                } else {
                  updatedSettings[key] = settings[key as keyof typeof settings];
                }
              }
              setSettings(updatedSettings as typeof settings);
            } else {
              const stringifiedSettings = Object.fromEntries(
                Object.entries(settings).map(([key, value]) => [key, String(value)])
              );
              setLocalSettings(stringifiedSettings);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adjust Focus Settings</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="mute-alerts">Mute Alerts</Label>
                <Switch id="mute-alerts" checked={isMuted} onCheckedChange={setIsMuted} />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="scoreThreshold" className="text-right">
                  Alert Score
                </Label>
                <Input
                  id="scoreThreshold"
                  type="number"
                  value={localSettings.scoreThreshold || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, scoreThreshold: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="criticalScoreThreshold" className="text-right">
                  Critical Alert Score
                </Label>
                <Input
                  id="criticalScoreThreshold"
                  type="number"
                  value={localSettings.criticalScoreThreshold || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, criticalScoreThreshold: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="minBlinks" className="text-right">
                  Min Blinks
                </Label>
                <Input
                  id="minBlinks"
                  type="number"
                  value={localSettings.minBlinks || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, minBlinks: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="maxBlinks" className="text-right">
                  Max Blinks
                </Label>
                <Input
                  id="maxBlinks"
                  type="number"
                  value={localSettings.maxBlinks || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, maxBlinks: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="blinkPenalty" className="text-right">
                  Blink Penalty
                </Label>
                <Input
                  id="blinkPenalty"
                  type="number"
                  step="0.01"
                  value={localSettings.blinkPenalty || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, blinkPenalty: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="slouchPenalty" className="text-right">
                  Slouch Penalty
                </Label>
                <Input
                  id="slouchPenalty"
                  type="number"
                  step="0.01"
                  value={localSettings.slouchPenalty || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, slouchPenalty: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notLookingPenalty" className="text-right">
                  Not Looking Penalty
                </Label>
                <Input
                  id="notLookingPenalty"
                  type="number"
                  step="0.01"
                  value={localSettings.notLookingPenalty || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, notLookingPenalty: e.target.value })}
                  className="col-span-3"
                />
                <Label htmlFor="EAR" className="text-right">
                  Eye aspect ratio
                </Label>
                <Input
                  id="EAR"
                  type="number"
                  step="0.01"
                  value={localSettings.EAR || ''}
                  onChange={(e) => setLocalSettings({ ...localSettings, EAR: e.target.value })}
                  className="col-span-3"
                />
              </div>
            </div>
            <div className="text-center text-xs text-gray-500">
              Your data is processed locally. Read our{' '}
              <a
                href="https://anotepad.com/note/read/4en4e7td"
                className="underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Privacy Policy
              </a>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
