
"use server";

import { summarizeMedicalReport, type MedicalReportSummaryOutput } from "@/ai/flows/summarize-medical-report";
import { z } from "zod";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ACCEPTED_FILE_TYPES = ["application/pdf"];

const formSchema = z.object({
  reportText: z.string().optional(),
  language: z.string(),
  file: z
    .any()
    .refine((file) => !file || file.size <= MAX_FILE_SIZE, `Max file size is 4MB.`)
    .refine(
      (file) => !file || ACCEPTED_FILE_TYPES.includes(file.type),
      "Only .pdf files are accepted."
    ).optional(),
}).refine(data => !!data.reportText || !!data.file, {
  message: "Please provide either text or a file.",
  path: ["reportText"],
});


export async function getSummary(values: z.infer<typeof formSchema>): Promise<{ data?: MedicalReportSummaryOutput; error?: string }> {
  const validatedFields = formSchema.safeParse(values);
  if (!validatedFields.success) {
    return { error: 'Invalid input.' };
  }

  try {
    let reportText = validatedFields.data.reportText;

    if (validatedFields.data.file && validatedFields.data.file.size > 0) {
      const pdf = (await import('pdf-parse')).default;
      const file = validatedFields.data.file as File;
      const buffer = Buffer.from(await file.arrayBuffer());
      const pdfData = await pdf(buffer);
      reportText = pdfData.text;
    }

    if (!reportText || reportText.length < 50) {
      return { error: 'Report text must be at least 50 characters.' };
    }


    const result = await summarizeMedicalReport({
      reportText,
      language: validatedFields.data.language,
    });
    return { data: result };
  } catch (e) {
    console.error(e);
    if (e instanceof Error && e.message.includes("May not be a PDF file")) {
      return { error: 'The uploaded file does not appear to be a valid PDF.' };
    }
    return { error: 'An unexpected error occurred. Please try again.' };
  }
}
