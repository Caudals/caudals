import { api } from '@/lib/evals/domain/http';
export const GET=api(async(_request,identity)=>identity);
