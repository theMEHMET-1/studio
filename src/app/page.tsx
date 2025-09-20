import {ReportForm} from '@/app/report-form';
import {HeartPulse} from 'lucide-react';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 sm:p-8 md:p-12 bg-background">
      <div className="w-full max-w-4xl flex-1 flex flex-col items-center text-center">
        <div className="bg-primary/20 p-4 rounded-full">
          <HeartPulse className="h-12 w-12 text-primary" />
        </div>
        <h1 className="mt-4 text-4xl font-headline font-bold text-foreground tracking-tight">
          Welcome to ClarityMD
        </h1>
        <p className="mt-2 max-w-2xl text-lg text-muted-foreground">
          Your friendly medical assistant. Upload a medical report to get a
          simplified summary.
        </p>
        <ReportForm />
      </div>
    </main>
  );
}
