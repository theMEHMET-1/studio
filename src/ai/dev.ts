import { config } from 'dotenv';
config();

import '@/ai/flows/simplify-medical-jargon.ts';
import '@/ai/flows/translate-medical-report.ts';
import '@/ai/flows/summarize-medical-report.ts';