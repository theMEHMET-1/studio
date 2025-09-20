// Summarize a medical report into a patient-friendly summary.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const MedicalReportSummaryInputSchema = z.object({
  reportText: z
    .string()
    .describe('The text content of the medical report.'),
  language: z
    .string()
    .optional()
    .default('en')
    .describe('The language to translate the summary to.'),
});

export type MedicalReportSummaryInput =
  z.infer<typeof MedicalReportSummaryInputSchema>;

const MedicalReportSummaryOutputSchema = z.object({
  summary: z.string().describe('The patient-friendly summary of the report.'),
});

export type MedicalReportSummaryOutput =
  z.infer<typeof MedicalReportSummaryOutputSchema>;

export async function summarizeMedicalReport(
  input: MedicalReportSummaryInput
): Promise<MedicalReportSummaryOutput> {
  return summarizeMedicalReportFlow(input);
}

const summarizeMedicalReportPrompt = ai.definePrompt({
  name: 'summarizeMedicalReportPrompt',
  input: {schema: MedicalReportSummaryInputSchema},
  output: {schema: MedicalReportSummaryOutputSchema},
  prompt: `You are an expert in simplifying medical reports for patients. Your task is to create a patient-friendly summary of the provided medical report.

If the specified language is not English, first translate the report to that language and then summarize it. Simplify any complex medical jargon so that a layperson can easily understand it.

Medical Report:
{{reportText}}

Language for summary: {{{language}}}

Provide only the simplified summary in the specified language.`,
});

const summarizeMedicalReportFlow = ai.defineFlow(
  {
    name: 'summarizeMedicalReportFlow',
    inputSchema: MedicalReportSummaryInputSchema,
    outputSchema: MedicalReportSummaryOutputSchema,
  },
  async input => {
    const {output} = await summarizeMedicalReportPrompt(input);
    return output!;
  }
);
