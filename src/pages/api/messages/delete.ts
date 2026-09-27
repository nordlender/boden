import { deleteMessage } from '../../../lib/messages';
import { withMessageIdAction } from '../../../lib/messages-http';
import { requireAdmin } from '../../../lib/wizard-http';

export const prerender = false;

// Admin-only for now. A moderator will eventually be able to delete their
// own message too (see issue #225) — that's a one-line change to this
// authorize callback (role check OR message.authorId === locals.user.id),
// not a reshape of withMessageIdAction.
export const POST = withMessageIdAction(deleteMessage, requireAdmin);
