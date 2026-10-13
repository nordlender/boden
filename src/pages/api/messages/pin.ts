import { pinMessage } from '../../../lib/messages';
import { withMessageIdAction } from '../../../lib/messages-http';
import { requireAdmin } from '../../../lib/http';

// Accepts any message id, unit notes included — deliberately not restricted
// to hub messages: the UI doesn't offer pinning on unit notes yet, but
// pinning them may be wanted later.
export const POST = withMessageIdAction(pinMessage, requireAdmin);
