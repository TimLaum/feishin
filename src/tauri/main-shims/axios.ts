// axios des modules main exécutés dans la webview (paroles) : les requêtes passent par le
// plugin HTTP de Tauri (côté Rust), sinon Genius/NetEase seraient bloqués par CORS.
import { fetch } from '@tauri-apps/plugin-http';
import axios from 'axios';

const instance = axios.create({ adapter: 'fetch', env: { fetch } });

export default instance;
