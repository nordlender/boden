import { hasRole } from '../../../lib/auth';
import { deleteMessage } from '../../../lib/messages';
import { withMessageIdAction } from '../../../lib/messages-http';

// An admin may delete any message; a moderator may delete only their own
// (matched on authorId, not the display-name snapshot in authorName — see
// issue #225 and the messages.authorId comment in src/db/schema.ts). A
// non-moderator falls through both checks and is denied.
export const POST = withMessageIdAction(deleteMessage, (locals, message) => {
	if (hasRole(locals.user?.role, 'admin')) return null;
	if (hasRole(locals.user?.role, 'moderator') && message.authorId !== null && message.authorId === locals.user?.id) return null;
	return new Response('Forbidden', { status: 403 });
});
