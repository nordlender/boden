import { pinMessage } from '../../../lib/messages';
import { withMessageIdAction } from '../../../lib/messages-http';
import { requireAdmin } from '../../../lib/wizard-http';

export const POST = withMessageIdAction(pinMessage, requireAdmin);
