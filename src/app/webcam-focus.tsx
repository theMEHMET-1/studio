'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button'; // New import
import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';

let faceLandmarker: FaceLandmarker;
let poseLandmarker: PoseLandmarker;
let drawingUtils: DrawingUtils;
let lastVideoTime = -1;

// Blink detection constants
const EYE_ASPECT_RATIO_THRESHOLD = 0.3;
const BLINK_CONSECUTIVE_FRAMES = 1;
let blinkCounter = 0;
let isBlinking = false;
let blinkTimestamps: number[] = [];

// Slouch detection constants
const SLOUCH_THRESHOLD = 0.05;

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
  const [isStarted, setIsStarted] = useState(false); // New state to track if the session has started

  const SCORE_THRESHOLD = 70;
  const GRACE_PERIOD_MS = 60000;
  const AUDIO_URL = 'https://files.catbox.moe/6mqp49.mp3';

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
    if (focusScore < SCORE_THRESHOLD && !hasWarned) {
      if (audioRef.current) {
        // audioRef.current.play() is now safe to call here because the user has
        // already interacted with the page to start the session.
        audioRef.current.play().catch(e => console.error("Audio playback failed:", e));
      }
      toast({
        variant: 'destructive',
        title: 'Focus Alert!',
        description: `Your focus score dropped to ${Math.round(focusScore)}%`,
      });
      setHasWarned(true);
    } else if (focusScore >= SCORE_THRESHOLD && hasWarned) {
      setHasWarned(false);
    }
  }, [focusScore, hasWarned, toast]);

  // New function to handle starting the webcam session
  const startWebcam = async () => {
    if (isStarted) return; // Prevent multiple starts
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

  const calculateEAR = (landmarks: NormalizedLandmark[], eyeIndices: number[]): number => {
    const p1 = landmarks[eyeIndices[0]];
    const p2 = landmarks[eyeIndices[1]];
    const p3 = landmarks[eyeIndices[2]];
    const p4 = landmarks[eyeIndices[3]];
    const p5 = landmarks[eyeIndices[4]];
    const p6 = landmarks[eyeIndices[5]];

    const distance = (pA: NormalizedLandmark, pB: NormalizedLandmark) =>
      Math.sqrt((pA.x - pB.x) ** 2 + (pA.y - pB.y) ** 2);

    const verticalDist = distance(p2, p6) + distance(p3, p5);
    const horizontalDist = distance(p1, p4);

    return verticalDist / (2 * horizontalDist);
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

      const startTimeMs = performance.now();
      const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
      const poseResults = poseLandmarker.detectForVideo(video, startTimeMs);

      canvasCtx.save();
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      let currentFocusPenalty = 0;
      let isSlouching = false;
      isBlinking = false;

      if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
        const landmarks = faceResults.faceLandmarks[0];

        // Left eye (indices based on MediaPipe docs)
        const leftEAR = calculateEAR(landmarks, [33, 160, 158, 133, 153, 144]);
        // Right eye
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
        blinkTimestamps = blinkTimestamps.filter(timestamp => now - timestamp < GRACE_PERIOD_MS);
        const blinksPerMinute = blinkTimestamps.length;

        if (now - startTimeRef.current > GRACE_PERIOD_MS) {
            if (blinksPerMinute < 10 || blinksPerMinute > 30) {
                currentFocusPenalty += 0.1;
            }
        }

        // Draw face landmarks
        drawingUtils.drawConnectors(
          landmarks,
          FaceLandmarker.FACE_LANDMARKS_TESSELATION,
          { color: '#C0C0C070', lineWidth: 1 }
        );

        const eyeColor = isBlinking ? '#FF0000' : '#30FF30';
        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, { color: eyeColor });
        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE, { color: eyeColor });

      }

      if (poseResults.landmarks && poseResults.landmarks.length > 0) {
        const landmarks = poseResults.landmarks[0];

        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        if(leftShoulder && rightShoulder && leftHip && rightHip) {
          const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
          const hipY = (leftHip.y + rightHip.y) / 2;

          if (shoulderY > hipY + SLOUCH_THRESHOLD) {
             isSlouching = true;
             currentFocusPenalty += 0.2;
          }
        }

        drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
        drawingUtils.drawLandmarks(landmarks, {
          color: isSlouching ? '#FF0000' : '#00FF00',
          radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
        });
      }
      canvasCtx.restore();

      setFocusScore(prevScore => {
        if (currentFocusPenalty > 0) {
          return Math.max(0, prevScore - currentFocusPenalty);
        }
        return Math.min(100, prevScore + 0.05);
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
            {/* Show a start button if the session hasn't started */}
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
        </CardContent>
      </Card>
    </div>
  );
}