// Summarize a medical report into a patient-friendly summary.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import wav from 'wav';

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
  audioSummary: z
    .string()
    .optional()
    .describe('The audio summary of the report in WAV format as a data URI.'),
});

export type MedicalReportSummaryOutput =
  z.infer<typeof MedicalReportSummaryOutputSchema>;

export async function summarizeMedicalReport(
  input: MedicalReportSummaryInput
): Promise<MedicalReportSummaryOutput> {
  return summarizeMedicalReportFlow(input);
}

const simplifyJargonTool = ai.defineTool({
  name: 'simplifyJargon',
  description: 'Simplifies complex medical terms into plain language equivalents.',
  inputSchema: z.object({
    text: z.string().describe('The text containing medical jargon.'),
  }),
  outputSchema: z.string().describe('The simplified text.'),
},
async input => {
  // This can call any typescript function to simplify the text. For now, just return the original text.
  return input.text;
});

const includeRelevantDetailsTool = ai.defineTool({
  name: 'includeRelevantDetails',
  description: 'Selectively includes relevant details from the medical report, such as diagnosis.',
  inputSchema: z.object({
    report: z.string().describe('The complete medical report.'),
  }),
  outputSchema: z.string().describe('The relevant details from the medical report.'),
},
async input => {
  // This can call any typescript function to extract relevant details. For now, just return the first 200 characters of the report.
  return input.report.substring(0, 200);
});

const translateTextTool = ai.defineTool({
  name: 'translateText',
  description: 'Translates text from one language to another.',
  inputSchema: z.object({
    text: z.string().describe('The text to translate.'),
    language: z.string().describe('The target language.'),
  }),
  outputSchema: z.string().describe('The translated text.'),
},
async input => {
  // This can call any typescript function to translate the text. For now, just return the original text.
  return input.text;
});

const summarizeMedicalReportPrompt = ai.definePrompt({
  name: 'summarizeMedicalReportPrompt',
  tools: [simplifyJargonTool, includeRelevantDetailsTool, translateTextTool],
  input: {schema: MedicalReportSummaryInputSchema},
  output: {schema: MedicalReportSummaryOutputSchema},
  prompt: `You are an expert in simplifying medical reports for patients.

  The medical report is below:
  {{reportText}}

  First, extract the relevant details from the medical report using the includeRelevantDetails tool.
  Then, simplify any complex medical terms in those details using the simplifyJargon tool.
  Then translate the simplified details to the target language, if it is not English, using the translateText tool.

  Finally, create a patient-friendly summary of the medical report in the specified language.
  Make sure to include the simplified and translated relevant details in the summary.

  Summary:`, // Ensure the output matches MedicalReportSummaryOutputSchema
});

const ttsPrompt = ai.definePrompt({
  name: 'ttsPrompt',
  prompt: `Generate spoken version of: {{{summary}}}`,
});

async function toWav(
  pcmData: Buffer,
  channels = 1,
  rate = 24000,
  sampleWidth = 2
): Promise<string> {
  return new Promise((resolve, reject) => {
    const writer = new wav.Writer({
      channels,
      sampleRate: rate,
      bitDepth: sampleWidth * 8,
    });

    let bufs = [] as any[];
    writer.on('error', reject);
    writer.on('data', function (d) {
      bufs.push(d);
    });
    writer.on('end', function () {
      resolve(Buffer.concat(bufs).toString('base64'));
    });

    writer.write(pcmData);
    writer.end();
  });
}

const summarizeMedicalReportFlow = ai.defineFlow(
  {
    name: 'summarizeMedicalReportFlow',
    inputSchema: MedicalReportSummaryInputSchema,
    outputSchema: MedicalReportSummaryOutputSchema,
  },
  async input => {
    const {output} = await summarizeMedicalReportPrompt(input);

    let audioSummary: string | undefined = undefined;
    if (input.language === 'en') {
      // Generate audio summary only if the language is English
      const { media } = await ai.generate({
        model: 'googleai/gemini-2.5-flash-preview-tts',
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Algenib' },
            },
          },
        },
        prompt: output!.summary,
      });

      if (media) {
        const audioBuffer = Buffer.from(
          media.url.substring(media.url.indexOf(',') + 1),
          'base64'
        );
        audioSummary = 'data:audio/wav;base64,' + (await toWav(audioBuffer));
      }
    }

    return { summary: output!.summary, audioSummary: audioSummary };
  }
);

