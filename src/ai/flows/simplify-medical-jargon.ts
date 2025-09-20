// This is a server-side file.
'use server';

/**
 * @fileOverview This flow simplifies medical jargon in a given text.
 *
 * @fileOverview simplifyMedicalJargon - A function that simplifies medical jargon in a given text.
 * @fileOverview SimplifyMedicalJargonInput - The input type for the simplifyMedicalJargon function.
 * @fileOverview SimplifyMedicalJargonOutput - The return type for the simplifyMedicalJargon function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SimplifyMedicalJargonInputSchema = z.object({
  text: z.string().describe('The medical text to simplify.'),
});
export type SimplifyMedicalJargonInput = z.infer<typeof SimplifyMedicalJargonInputSchema>;

const SimplifyMedicalJargonOutputSchema = z.object({
  simplifiedText: z.string().describe('The medical text with simplified jargon.'),
});
export type SimplifyMedicalJargonOutput = z.infer<typeof SimplifyMedicalJargonOutputSchema>;

export async function simplifyMedicalJargon(input: SimplifyMedicalJargonInput): Promise<SimplifyMedicalJargonOutput> {
  return simplifyMedicalJargonFlow(input);
}

const prompt = ai.definePrompt({
  name: 'simplifyMedicalJargonPrompt',
  input: {schema: SimplifyMedicalJargonInputSchema},
  output: {schema: SimplifyMedicalJargonOutputSchema},
  prompt: `You are a medical expert skilled at explaining complex medical terms to patients.

  Please simplify the following medical text so that it is easy for a layperson to understand. Replace any complex medical jargon with plain language equivalents. Retain all key details.

  Medical Text:
  {{text}}`,
});

const simplifyMedicalJargonFlow = ai.defineFlow(
  {
    name: 'simplifyMedicalJargonFlow',
    inputSchema: SimplifyMedicalJargonInputSchema,
    outputSchema: SimplifyMedicalJargonOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
