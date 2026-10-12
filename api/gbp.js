import {createHandler} from '../src/gbp-api.mjs';

// All provider credentials stay in the function environment.
export async function GET(request) { return createHandler(process.env)(request); }
export async function POST(request) { return createHandler(process.env)(request); }

