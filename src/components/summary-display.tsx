"use client";

import { useState } from "react";
import { Copy, Check, Volume2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface SummaryDisplayProps {
  summary: string;
  audioSummary?: string;
}

export function SummaryDisplay({ summary, audioSummary }: SummaryDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="animate-in fade-in-0 duration-500">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="font-headline text-2xl">
              Your Simplified Summary
            </CardTitle>
            <CardDescription>
              Here is an easy-to-understand version of your report.
            </CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={handleCopy}>
            {copied ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <Copy className="h-5 w-5" />
            )}
            <span className="sr-only">Copy summary</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
            {summary}
          </p>
          {audioSummary && (
            <div className="flex items-center gap-4 rounded-lg border bg-secondary/50 p-4">
              <Volume2 className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <p className="font-semibold">Audio Summary</p>
                <audio controls className="w-full mt-2">
                  <source src={audioSummary} type="audio/wav" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
