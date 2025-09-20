
"use server";

import { summarizeMedicalReport, type MedicalReportSummaryOutput } from "@/ai/flows/summarize-medical-report";
import { z } from "zod";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ACCEPTED_FILE_TYPES = ["application/pdf"];

const inputSchema = z.object({
  reportText: z.string().optional(),
  reportFile: z
    .any()
    .refine(file => !file || file.size <= MAX_FILE_SIZE, `Max file size is 4MB.`)
    .refine(
      file => !file || ACCEPTED_FILE_TYPES.includes(file.type),
      'Only .pdf files are accepted.'
    )
    .optional(),
  language: z.string().default('en'),
}).refine(data => !!data.reportText || !!data.reportFile, {
  message: "Please provide either text or a file.",
});

export async function getSummary(formData: FormData): Promise<{
  summary?: MedicalReportSummaryOutput;
  error?: string;
}> {
  try {
    const reportFile = formData.get('reportFile') as File | null;
    let reportText = formData.get('reportText') as string | null;
    const language = formData.get('language') as string | 'en';

    const validation = inputSchema.safeParse({ reportFile: reportFile && reportFile.size > 0 ? reportFile : undefined, reportText: reportText || undefined, language });

    if (!validation.success) {
      return { error: validation.error.errors.map(e => e.message).join(', ') };
    }

    let textToSummarize = reportText;

    if (reportFile && reportFile.size > 0) {
      const pdf = (await import('pdf-parse')).default;
      const data = await reportFile.arrayBuffer();
      const pdfData = await pdf(Buffer.from(data));
      textToSummarize = pdfData.text;
    }

    if (!textToSummarize) {
      return { error: 'No medical report provided.' };
    }

    const summary = await summarizeMedicalReport({
      reportText: textToSummarize,
      language: language || 'en',
    });

    return { summary };
  } catch (error: any) {
    console.error(error);
    return { error: error.message || 'An unexpected error occurred.' };
  }
}
