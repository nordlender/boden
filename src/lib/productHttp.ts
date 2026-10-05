import { ProductInputError } from './products';

// Runs a create/update call; bad-input errors come back as a 400 Response
// instead of the result. Anything else is a real bug and still throws.
export async function saveOr400<T>(save: () => Promise<T>): Promise<T | Response> {
	try {
		return await save();
	} catch (err) {
		if (err instanceof ProductInputError) return new Response(err.message, { status: 400 });
		throw err;
	}
}
