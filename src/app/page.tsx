import { WebcamFocus } from '@/app/webcam-focus';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12 bg-background">
      <div className="w-full max-w-666666ex-1 flex flex-col items-center text-center">
        <h1 className="mt-4 text-4xl font-headline font-bold text-foreground tracking-tight">
          FocusUp!
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
          A browser buddy to help you stay focused on your work! Get nudges to help keep you on track, and visualize your attention.
        </p>
	<m className="mt-2 max-w-lg text-sm text-muted-foreground">
	  Tip: check your camera permissions if the session cannot start!
	</m>
        <WebcamFocus />
      </div>
    </main>
  );
}
