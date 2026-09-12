/* Punto de entrada que esbuild empaqueta en vendor/three.bundle.js.
   Expone three, el cargador de glTF y el post-procesado como globales para que
   el juego se cargue con <script> clásicos (y funcione desde file:// y desde el
   WebView de Android). */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

window.THREE = THREE;
window.GLTFLoader = GLTFLoader;
window.PostFX = {
  EffectComposer: EffectComposer,
  RenderPass: RenderPass,
  UnrealBloomPass: UnrealBloomPass,
  ShaderPass: ShaderPass,
  GTAOPass: GTAOPass,
  OutputPass: OutputPass
};
