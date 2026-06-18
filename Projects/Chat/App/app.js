/**
 * app.js — P2P Chat v3.6.0 (entry point)
 * Implementation lives in ./modules/*.js — this file only wires startup order:
 * Firebase must be initialized before any module that touches firebase.auth()/firestore() runs.
 */
import { FB_CFG } from './modules/constants.js';
import { App } from './modules/app-api.js';
import { init } from './modules/init.js';

firebase.initializeApp(FB_CFG);

window.App = App;

init();