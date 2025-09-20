'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  FaceLandmarker,
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from '@mediapipe/tasks-vision';

let faceLandmarker: FaceLandmarker;
let poseLandmarker: PoseLandmarker;
let drawingUtils: DrawingUtils;
let lastVideoTime = -1;

export function WebcamFocus() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasCameraPermission, setHasCameraPermission] = useState<boolean | null>(
    null
  );
  const [focusScore, setFocusScore] = useState(100);
  const { toast } = useToast();

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
    const getCameraPermission = async () => {
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

    getCameraPermission();
  }, [toast]);

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

      if (faceResults.faceLandmarks) {
        for (const landmarks of faceResults.faceLandmarks) {
          drawingUtils.drawConnectors(
            landmarks,
            FaceLandmarker.FACE_LANDMARKS_TESSELATION,
            { color: '#C0C0C070', lineWidth: 1 }
          );
        }
      }
      if (poseResults.landmarks) {
        for (const landmarks of poseResults.landmarks) {
          drawingUtils.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
          drawingUtils.drawLandmarks(landmarks, {
            radius: (data) => DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1),
          });
        }
      }
      canvasCtx.restore();
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
