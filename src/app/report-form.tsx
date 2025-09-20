
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Loader2, FileUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getSummary } from "./actions";
import { SummaryDisplay } from "@/components/summary-display";
import type { MedicalReportSummaryOutput } from "@/ai/flows/summarize-medical-report";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ACCEPTED_FILE_TYPES = ["application/pdf"];

const formSchema = z.object({
  reportText: z
    .string()
    .max(50000, "Report is too long. Please keep it under 50,000 characters.")
    .optional(),
  language: z.enum(["en", "es", "tr"]).default("en"),
  file: z
    .any()
    .refine((file) => !file || file.size <= MAX_FILE_SIZE, `Max file size is 4MB.`)
    .refine(
      (file) => !file || ACCEPTED_FILE_TYPES.includes(file.type),
      "Only .pdf files are accepted."
    ).optional(),
}).refine(data => {
  if (data.reportText && data.reportText.length > 0 && data.reportText.length < 50) return false;
  return true;
}, {
  message: "Please enter at least 50 characters.",
  path: ["reportText"],
}).refine(data => !!data.reportText || !!data.file, {
  message: "Please provide either text or a file.",
  path: ["reportText"],
});

type FormValues = z.infer<typeof formSchema>;

export default function ReportForm() {
  const [result, setResult] = useState<MedicalReportSummaryOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("text");

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      reportText: "",
      language: "en",
    },
    mode: "onChange"
  });

  async function onSubmit(values: FormValues) {
    setIsLoading(true);
    setResult(null);

    const submissionValues = {
      language: values.language,
      reportText: values.reportText,
      file: values.file,
    }

    const { data, error } = await getSummary(submissionValues);

    if (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error,
      });
    } else if (data) {
      setResult(data);
    }

    setIsLoading(false);
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardContent className="p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={activeTab} onValueChange={(value) => {
                setActiveTab(value);
                form.reset({
                  ...form.getValues(),
                  reportText: "",
                  file: undefined,
                })
                form.clearErrors();
              }} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">Paste Text</TabsTrigger>
                  <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
                </TabsList>
                <TabsContent value="text">
                  <FormField
                    control={form.control}
                    name="reportText"
                    render={({ field }) => (
                      <FormItem className="mt-6">
                        <FormLabel className="text-lg font-semibold">
                          Medical Report Text
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Paste your medical report text here..."
                            className="min-h-[250px] resize-y"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
                <TabsContent value="pdf">
                  <FormField
                    control={form.control}
                    name="file"
                    render={({ field }) => (
                      <FormItem className="mt-6">
                         <FormLabel className="text-lg font-semibold">
                          Upload Report PDF
                        </FormLabel>
                        <FormControl>
                          <div className="flex items-center justify-center w-full">
                            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer bg-secondary/50 hover:bg-secondary/80">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <FileUp className="w-8 h-8 mb-4 text-muted-foreground" />
                                    <p className="mb-2 text-sm text-muted-foreground">
                                      <span className="font-semibold">Click to upload</span> or drag and drop
                                    </p>
                                    <p className="text-xs text-muted-foreground">PDF (MAX. 4MB)</p>
                                    {field.value?.name && <p className="mt-4 text-sm font-medium text-primary">{field.value.name}</p>}
                                </div>
                                <Input id="dropzone-file" type="file" className="hidden" accept=".pdf" 
                                  onChange={(e) => field.onChange(e.target.files ? e.target.files[0] : null)}
                                />
                            </label>
                          </div> 
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>
              
              <div className="flex flex-col sm:flex-row sm:items-end gap-4 pt-4">
                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem className="w-full sm:w-auto">
                      <FormLabel>Language</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a language" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="en">English</SelectItem>
                          <SelectItem value="es">Spanish</SelectItem>
                          <SelectItem value="tr">Turkish</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="w-full sm:w-auto sm:ml-auto"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Summarizing...
                    </>
                  ) : (
                    "Get Summary"
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-center min-h-[200px] flex-col">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-muted-foreground">
                Generating your simplified summary...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <SummaryDisplay
          summary={result.summary}
          audioSummary={result.audioSummary}
        />
      )}
    </div>
  );
}
