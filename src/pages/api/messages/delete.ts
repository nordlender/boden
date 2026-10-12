import { deleteMessage } from '../../../lib/messages';
import { withMessageIdAction } from '../../../lib/messages-http';
import { requireAdmin } from '../../../lib/http';

// Only admins may delete a message — hub posts and unit notes alike (unit
// notes are a safety record). Messages are never edited; a correction is a
// new message.
export const POST = withMessageIdAction(deleteMessage, requireAdmin);
