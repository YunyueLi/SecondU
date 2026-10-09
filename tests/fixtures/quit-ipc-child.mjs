import { createApp } from '../../server/index.mjs';
import { installQuitIpc } from '../../server/update-lifecycle.mjs';

const app = createApp({ dataDir: process.env.QUIT_FIXTURE_DIR, seed: false, scheduler: false, computerInfo: { codexAvailable: false } });
installQuitIpc(app);
app.server.listen(0, '127.0.0.1', () => process.send({ type: 'fixture-ready' }));
