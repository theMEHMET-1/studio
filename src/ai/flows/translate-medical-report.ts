'use server';

/**
 * @fileOverview This file defines a Genkit flow for translating and
 * simplifying medical reports into a patient-friendly format in different
 * languages.
 *
 * - translateMedicalReport - A function that takes a medical report and
 *   target language as input, and returns a translated and simplified summary.
 * - TranslateMedicalReportInput - The input type for the
 *   translateMedicalReport function.
 * - TranslateMedicalReportOutput - The return type for the
 *   translateMedicalReport function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const TranslateMedicalReportInputSchema = z.object({
  reportText: z
    .string()
    .describe('The text of the medical report to be translated and simplified.'),
  targetLanguage: z
    .string()
    .describe(
      'The target language for the translated summary (e.g., Spanish, Turkish).'
    ),
});
export type TranslateMedicalReportInput = z.infer<
  typeof TranslateMedicalReportInputSchema
>;

const TranslateMedicalReportOutputSchema = z.object({
  translatedSummary: z
    .string()
    .describe('The translated and simplified summary of the medical report.'),
});
export type TranslateMedicalReportOutput = z.infer<
  typeof TranslateMedicalReportOutputSchema
>;

export async function translateMedicalReport(
  input: TranslateMedicalReportInput
): Promise<TranslateMedicalReportOutput> {
  return translateMedicalReportFlow(input);
}

const prompt = ai.definePrompt({
  name: 'translateMedicalReportPrompt',
  input: {schema: TranslateMedicalReportInputSchema},
  output: {schema: TranslateMedicalReportOutputSchema},
  prompt: `You are a medical expert tasked with translating and simplifying medical reports for patients.

  Please translate the following medical report into {{{targetLanguage}}} and simplify the medical jargon so that it is easy for a layperson to understand.

  Medical Report:
  {{reportText}}

  Translation and Simplified Summary:`,
});

const translateMedicalReportFlow = ai.defineFlow(
  {
    name: 'translateMedicalReportFlow',
    inputSchema: TranslateMedicalReportInputSchema,
    outputSchema: TranslateMedicalReportOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
