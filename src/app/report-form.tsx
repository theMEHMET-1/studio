'use client';

import {zodResolver} from '@hookform/resolvers/zod';
import {useForm} from 'react-hook-form';
import {z} from 'zod';
import {Button} from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {useToast} from '@/hooks/use-toast';
import {useState, useTransition} from 'react';
import {getSummary} from '@/app/actions';
import type {MedicalReportSummaryOutput} from '@/ai/flows/summarize-medical-report';
import {Card, CardContent, CardHeader, CardTitle} from '@/components/ui/card';
import {Tabs, TabsContent, TabsList, TabsTrigger} from '@/components/ui/tabs';
import {Loader2} from 'lucide-react';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ACCEPTED_FILE_TYPES = ['application/pdf'];

const formSchema = z.object({
  reportText: z.string().optional(),
  reportFile: z
    .any()
    .refine(file => {
      if (!file || !file.size) return true;
      return file.size <= MAX_FILE_SIZE;
    }, `Max file size is 4MB.`)
    .refine(file => {
      if (!file || !file.type) return true;
      return ACCEPTED_FILE_TYPES.includes(file.type);
    }, 'Only .pdf files are accepted.')
    .optional(),
  language: z.string().default('en'),
});

export function ReportForm() {
  const [isPending, startTransition] = useTransition();
  const {toast} = useToast();
  const [summary, setSummary] = useState<MedicalReportSummaryOutput | null>(
    null
  );
  const [activeTab, setActiveTab] = useState('text');

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reportText: '',
      language: 'en',
    },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setSummary(null);

    if (activeTab === 'text' && !values.reportText) {
      form.setError('reportText', {
        type: 'manual',
        message: 'Please paste your medical report.',
      });
      return;
    }

    if (activeTab === 'file' && !values.reportFile) {
      form.setError('reportFile', {
        type: 'manual',
        message: 'Please upload a PDF file.',
      });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      if (values.reportFile) {
        formData.append('reportFile', values.reportFile);
      }
      if (values.reportText) {
        formData.append('reportText', values.reportText);
      }
      formData.append('language', values.language);

      try {
        const result = await getSummary(formData);
        if (result.error) {
          toast({
            variant: 'destructive',
            title: 'Error',
            description: result.error,
          });
        } else {
          setSummary(result.summary!);
        }
      } catch (e: any) {
        toast({
          variant: 'destructive',
          title: 'An unexpected error occurred',
          description: e.message || 'Please try again later.',
        });
      }
    });
  }

  return (
    <div className="w-full mt-8">
      <Tabs
        defaultValue="text"
        className="w-full"
        onValueChange={setActiveTab}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="text">Paste Text</TabsTrigger>
          <TabsTrigger value="file">Upload PDF</TabsTrigger>
        </TabsList>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <TabsContent value="text">
              <FormField
                control={form.control}
                name="reportText"
                render={({field}) => (
                  <FormItem>
                    <FormLabel>Medical Report Text</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Paste your medical report here..."
                        className="min-h-[200px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>
            <TabsContent value="file">
              <FormField
                control={form.control}
                name="reportFile"
                render={({field}) => (
                  <FormItem>
                    <FormLabel>Medical Report File</FormLabel>
                    <FormControl>
                      <Input
                        type="file"
                        accept=".pdf"
                        onChange={e =>
                          field.onChange(e.target.files?.[0] ?? null)
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      Upload a PDF of your medical report (max 4MB).
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>

            <FormField
              control={form.control}
              name="language"
              render={({field}) => (
                <FormItem>
                  <FormLabel>Language for Summary</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., English, Spanish" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isPending} className="w-full">
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Get Summary
            </Button>
          </form>
        </Form>
      </Tabs>

      {isPending && (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {summary && (
        <Card className="mt-8 w-full text-left">
          <CardHeader>
            <CardTitle>Your Patient-Friendly Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap">{summary.summary}</p>
            {summary.audioSummary && (
              <div className="mt-4">
                <p className="font-semibold mb-2">Listen to the summary:</p>
                <audio controls src={summary.audioSummary} className="w-full">
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}