
"use server";

import { summarizeMedicalReport, type MedicalReportSummaryOutput } from "@/ai/flows/summarize-medical-report";
import { z } from "zod";

const SummarizeSchema = z.object({
  reportText: z.string().min(50, { message: "Report text must be at least 50 characters." }),
  language: z.string(),
});

export async function getSummary(values: z.infer<typeof SummarizeSchema>): Promise<{ data?: MedicalReportSummaryOutput; error?: string }> {
  const validatedFields = SummarizeSchema.safeParse(values);
  if (!validatedFields.success) {
    return { error: 'Invalid input.' };
  }

  try {
    const result = await summarizeMedicalReport(validatedFields.data);
    return { data: result };
  } catch (e) {
    console.error(e);
    return { error: 'An unexpected error occurred. Please try again.' };
  }
}
