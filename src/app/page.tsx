import { WebcamFocus } from '@/app/webcam-focus';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12 bg-background">
      <div className="w-full max-w-4xl flex-1 flex flex-col items-center text-center">
        <h1 className="mt-4 text-4xl font-headline font-bold text-foreground tracking-tight">
          Bollocks
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
          every day is a gamble and gambling is awesome.
        </p>
        <WebcamFocus />
      </div>
    </main>
  );
}
