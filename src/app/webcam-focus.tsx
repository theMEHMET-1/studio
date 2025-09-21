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
import {calculateEAR, distance, distanceWithArray, angleBetween, midpoint} from "./utils.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Settings } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

let faceLandmarker: FaceLandmarker;
let poseLandmarker: PoseLandmarker;
let drawingUtils: DrawingUtils;
let lastVideoTime = -1;

// Blink detection constants
const EYE_ASPECT_RATIO_THRESHOLD = 0.175;
const BLINK_CONSECUTIVE_FRAMES = 1;
const MINBLINK = 3;
const MAXBLINK = 30;
const CHEEKBONESMAX = 0.5; 
const CHEEKBONESMIN = -4.5;

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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef(Date.now());
  const [isStarted, setIsStarted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const GRACE_PERIOD_MS = 60000;
  const AUDIO_URL = 'https://files.catbox.moe/6mqp49.mp3';

  // State for real-time indicators
  const [blinksPerMinute, setBlinksPerMinute] = useState(0);
  const [isSlouching, setIsSlouching] = useState(false);
  const [isNotLooking, setIsNotLooking] = useState(false);

  // State for settings
  const [settings, setSettings] = useState({
    scoreThreshold: 70,
    minBlinks: 10,
    maxBlinks: 30,
    slouchPenalty: 0.2,
    notLookingPenalty: 0.2,
    blinkPenalty: 0.1,
    slouchThresholdMin: -0.045, // New setting
    slouchThresholdMax: -0.03, // New setting
  });

  // Local state for dialog inputs, now as strings
  const [localSettings, setLocalSettings] = useState<Record<string, string>>({});


  // Initialize the audio object on component mount
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(AUDIO_URL);
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

  // Effect to watch for score changes and trigger alerts
  useEffect(() => {
    if (focusScore < settings.scoreThreshold && !hasWarned) {
      if (audioRef.current && !isMuted) {
        audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
      }
      toast({
        variant: 'destructive',
        title: 'Alert! Eyes & Posture Check!',
        description: `Your score has dropped to ${Math.round(focusScore)}%`,
      });
      setHasWarned(true);
    } else if (focusScore >= settings.scoreThreshold && hasWarned) {
      setHasWarned(false);
    }
  }, [focusScore, hasWarned, toast, settings.scoreThreshold, isMuted]);

  // New function to handle starting the webcam session
  const startWebcam = async () => {
    if (isStarted) return;
    setIsStarted(true);

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
        videoRef.current.addEventListener('loadeddata', predictWebcam);
      }
      if (canvasRef.current) {
        drawingUtils = new DrawingUtils(
          canvasRef.current.getContext('2d')!
        );
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
      requestAnimationFrame(predictWebcam);
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d')!;

    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const faceResults = faceLandmarker.detectForVideo(
        video,
        performance.now()
      );
      const poseResults = poseLandmarker.detectForVideo(
        video,
        performance.now()
      );

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      let currentFocusPenalty = 0;
      let isSlouchingNow = false;
      let isNotLookingNow = false;
      isBlinking = false;

      if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
        const landmarks = faceResults.faceLandmarks[0];

        const leftEAR = calculateEAR(landmarks, [33, 160, 158, 133, 153, 144]);
        const rightEAR = calculateEAR(landmarks, [362, 385, 387, 263, 373, 380]);
        const avgEAR = (leftEAR + rightEAR) / 2;

        if (avgEAR < EYE_ASPECT_RATIO_THRESHOLD) {
          blinkCounter++;
        } else {
          if (blinkCounter >= BLINK_CONSECUTIVE_FRAMES) {
            isBlinking = true;
            blinkTimestamps.push(Date.now());
          }
          blinkCounter = 0;
        }

        const now = Date.now();
        blinkTimestamps = blinkTimestamps.filter(timestamp => now - timestamp < 60000);
        const blinksPerMinute = blinkTimestamps.length;
        setBlinksPerMinute(blinksPerMinute);

        if (now - startTimeRef.current > GRACE_PERIOD_MS) {
            if (blinksPerMinute < settings.minBlinks || blinksPerMinute > settings.maxBlinks) {
                currentFocusPenalty += settings.blinkPenalty;
            }
        }

        const cheekbonesDif = distance(landmarks[8], landmarks[6])*100 - distance(landmarks[7], landmarks[3])*100
        if (cheekbonesDif < CHEEKBONESMIN || cheekbonesDif > CHEEKBONESMAX) {
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
        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: eyeColor });
        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: eyeColor });

        

        // blinking done
        
        const bodylandmarks = poseResults.landmarks[0];
        const midpointarray = midpoint(bodylandmarks[11], bodylandmarks[12]);

        const angle = angleBetween(bodylandmarks[0], midpointarray[0], midpointarray[1], midpointarray[0], midpointarray[1] - 1);
        
        const avgEarY = (bodylandmarks[7].y + bodylandmarks[8].y) / 2;

        const distHeadToShoulder = distance(bodylandmarks[0], midpointarray);
        
        if (angle > 20 && (bodylandmarks[0].y < avgEarY + settings.slouchThresholdMax || bodylandmarks[0].y > avgEarY + settings.slouchThresholdMin)) {
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

      setFocusScore(prevScore => {
        if (poseResults.landmarks.length == 0){
          return prevScore - 0.01;
        }
        if (currentFocusPenalty > 0) {
          return Math.max(0, prevScore - currentFocusPenalty);
        }
        return Math.min(100, prevScore + 0.025);
      });
    }

    requestAnimationFrame(predictWebcam);
  };

  return (
    <div className="w-full max-w-2xl mt-8 flex flex-col items-center gap-8">
      <Card className="w-full">
        <CardContent className="p-4">
          <div className="relative w-full aspect-video rounded-md overflow-hidden bg-muted">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              autoPlay
              muted
              playsInline
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
            />
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
            {!isStarted && (
              <div className="absolute inset-0 flex items-center justify-center p-4 bg-black/50">
                <Button onClick={startWebcam}>Start Webcam Session</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="w-full">
        <CardHeader>
          <CardTitle>Focus Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Progress value={focusScore} className="w-full" />
            <span className="text-2xl font-bold">
              {Math.round(focusScore)}%
            </span>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <p><strong>Blinks Per Minute:</strong> {blinksPerMinute}</p>
            <p><strong>Posture:</strong> {isSlouching ? <span className="text-red-500">Slouching</span> : <span className="text-green-500">Good</span>}</p>
            <p><strong>Looking at Screen:</strong> {isNotLooking ? <span className="text-red-500">No</span> : <span className="text-green-500">Yes</span>}</p>
          </div>
        </CardContent>
      </Card>

      {/* Settings Dialog */}
      <Dialog
        onOpenChange={(open) => {
          if (!open) {
            // Validate and update settings only when closing the dialog
            const newSettings = {...localSettings};
            const updatedSettings: Record<string, number> = {};

            // Loop through each setting to convert from string to number
            for (const key in newSettings) {
                const value = newSettings[key as keyof typeof newSettings];
                const numValue = parseFloat(value);
                // Check if the input is a valid number, otherwise use the old setting
                if (value.trim() !== '' && !isNaN(numValue)) {
                    updatedSettings[key] = numValue;
                } else {
                    updatedSettings[key] = settings[key as keyof typeof settings];
                }
            }
            setSettings(updatedSettings as typeof settings);
          } else {
            // Populate localSettings with current settings as strings when opening
            const stringifiedSettings = Object.fromEntries(
                Object.entries(settings).map(([key, value]) => [key, String(value)])
            );
            setLocalSettings(stringifiedSettings);
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline" className="mt-4">
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Focus Settings</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Mute toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="mute-alerts">Mute Alerts</Label>
              <Switch
                id="mute-alerts"
                checked={isMuted}
                onCheckedChange={setIsMuted}
              />
            </div>
            {/* Input fields */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scoreThreshold" className="text-right">
                Alert Score
              </Label>
              <Input
                id="scoreThreshold"
                type="number"
                value={localSettings.scoreThreshold}
                onChange={(e) => setLocalSettings({...localSettings, scoreThreshold: e.target.value})}
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
                value={localSettings.minBlinks}
                onChange={(e) => setLocalSettings({...localSettings, minBlinks: e.target.value})}
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
                value={localSettings.maxBlinks}
                onChange={(e) => setLocalSettings({...localSettings, maxBlinks: e.target.value})}
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
                value={localSettings.blinkPenalty}
                onChange={(e) => setLocalSettings({...localSettings, blinkPenalty: e.target.value})}
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
                value={localSettings.slouchPenalty}
                onChange={(e) => setLocalSettings({...localSettings, slouchPenalty: e.target.value})}
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
                value={localSettings.notLookingPenalty}
                onChange={(e) => setLocalSettings({...localSettings, notLookingPenalty: e.target.value})}
                className="col-span-3"
              />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slouchThresholdMax" className="text-right">
                Slouch Threshold Max
              </Label>
              <Input
                id="slouchThresholdMax"
                type="number"
                step="0.001"
                value={localSettings.slouchThresholdMax}
                onChange={(e) => setLocalSettings({...localSettings, slouchThresholdMax: e.target.value})}
                className="col-span-3"
              />
            </div>
             <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slouchThresholdMin" className="text-right">
                Slouch Threshold Min
              </Label>
              <Input
                id="slouchThresholdMin"
                type="number"
                step="0.001"
                value={localSettings.slouchThresholdMin}
                onChange={(e) => setLocalSettings({...localSettings, slouchThresholdMin: e.target.value})}
                className="col-span-3"
              />
            </div>
          </div>
          <div className="text-center text-xs text-gray-500">
            Your data is processed locally. Read our{' '}
            <a href="/privacy-policy" className="underline" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}