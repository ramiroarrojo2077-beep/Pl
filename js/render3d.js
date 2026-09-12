/* Vista 3D: escena de three.js alimentada con el estado del juego.
 *
 * Los modelos vienen de blender/build_models.py, empaquetados en js/models.gen.js.
 * El juego sigue razonando en píxeles 2D (x, y); aquí se traduce a unidades de
 * mundo (1 unidad = 1 casilla) con x -> X e y -> Z.
 */
(function (TD) {
  'use strict';

  var T = TD.TILE;
  var TAU = Math.PI * 2;

  function w(px) { return px / T; }

  /* Orientación: los modelos miran a -Z (eje +Y de Blender). */
  function yawFor(angle2d) { return -angle2d - Math.PI / 2; }

  function b64ToBuffer(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function Renderer(canvas, game) {
    this.canvas = canvas;
    this.game = game;
    this.models = {};
    this.towerViews = new Map();
    this.enemyViews = new Map();
    this.projViews = new Map();
    this.ready = false;
    this.time = 0;
    this.shakeAmount = 0;
    /* Calidad automática, con salida manual: ?calidad=baja apaga el
       post-procesado y aligera sombras y detalle del suelo. */
    var forced = (location.search.match(/[?&]calidad=(alta|baja)/) || [])[1];
    this.quality = forced === 'baja' ? 'low'
      : forced === 'alta' ? 'high'
      : (window.devicePixelRatio > 1 && window.innerWidth < 900 ? 'low' : 'high');
  }

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.load = function (onReady) {
    var self = this;
    this.buildScene();
    var loader = new window.GLTFLoader();
    loader.parse(b64ToBuffer(TD.MODELS_GLB), '', function (gltf) {
      gltf.scene.children.slice().forEach(function (node) {
        node.position.set(0, 0, 0);
        node.rotation.set(0, 0, 0);
        self.prepareModel(node);
        self.models[node.name] = node;
      });
      self.buildStaticScenery();
      self.ready = true;
      if (onReady) onReady();
    }, function (err) {
      console.error('No se pudieron cargar los modelos', err);
    });
  };

  Renderer.prototype.prepareModel = function (root) {
    root.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      var m = o.material;
      if (m && m.emissiveIntensity > 0 && m.emissive && m.emissive.getHex() !== 0) {
        o.castShadow = false;
      }
      if (m) {
        m.side = THREE.FrontSide;
        if (m.isMeshStandardMaterial) m.envMapIntensity = 0.55;
      }
    });
  };

  Renderer.prototype.buildScene = function () {
    var THREE = window.THREE;
    var renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: this.quality === 'high',
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(this.quality === 'high' ? 2 : 1.5, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.renderer = renderer;

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xa9c0cc, 40, 128);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(42, 16 / 10, 0.5, 120);
    this.camTarget = new THREE.Vector3(TD.GRID_W / 2, 0, TD.GRID_H / 2 - 4.2);

    var hemi = new THREE.HemisphereLight(0xbcd8ff, 0x4b6b35, 1.15);
    scene.add(hemi);

    /* Sol bajo de media tarde: sombras largas y luz cálida. */
    var sun = new THREE.DirectionalLight(0xffe9c2, 2.7);
    sun.position.set(TD.GRID_W * 1.15, 15.5, -3.5);
    sun.target.position.set(TD.GRID_W / 2, 0, TD.GRID_H / 2);
    sun.castShadow = true;
    var shadowSize = this.quality === 'high' ? 2560 : 1280;
    sun.shadow.mapSize.set(shadowSize, shadowSize);
    sun.shadow.camera.left = -12;
    sun.shadow.camera.right = 12;
    sun.shadow.camera.top = 12;
    sun.shadow.camera.bottom = -12;
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 42;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.022;
    scene.add(sun);
    scene.add(sun.target);

    var rim = new THREE.DirectionalLight(0x9db8ff, 0.5);
    rim.position.set(-8, 7, 14);
    scene.add(rim);

    this.buildSky();
    this.buildGround();
    this.buildHelpers();
    this.buildComposer();
    this.resize();
  };

  Renderer.prototype.buildGround = function () {
    var THREE = window.THREE;
    var level = this.game.level;

    var tex = new THREE.CanvasTexture(level.bg);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(16, this.renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;

    var ground = new THREE.Mesh(
      new THREE.PlaneGeometry(TD.GRID_W, TD.GRID_H),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.97, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(TD.GRID_W / 2, 0, TD.GRID_H / 2);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.ground = ground;

    /* Zócalo: el tablero se lee como una maqueta apoyada en la mesa. */
    var soil = new THREE.Mesh(
      new THREE.BoxGeometry(TD.GRID_W + 0.5, 0.46, TD.GRID_H + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x5f4e35, roughness: 1 })
    );
    soil.position.set(TD.GRID_W / 2, -0.24, TD.GRID_H / 2);
    soil.receiveShadow = true;
    this.scene.add(soil);
  };

  /* Cúpula de cielo con degradado: cénit azul, horizonte cálido. */
  Renderer.prototype.buildSky = function () {
    var THREE = window.THREE;
    var sky = new THREE.Mesh(
      new THREE.SphereGeometry(240, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          top: { value: new THREE.Color(0x3f7fbf) },
          middle: { value: new THREE.Color(0x9fc4dd) },
          bottom: { value: new THREE.Color(0xdcd0b4) }
        },
        vertexShader: [
          'varying vec3 vPos;',
          'void main() {',
          '  vPos = position;',
          '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '}'
        ].join('\n'),
        fragmentShader: [
          'uniform vec3 top; uniform vec3 middle; uniform vec3 bottom;',
          'varying vec3 vPos;',
          'void main() {',
          '  float h = normalize(vPos).y;',
          '  vec3 c = mix(bottom, middle, smoothstep(-0.08, 0.16, h));',
          '  c = mix(c, top, smoothstep(0.14, 0.62, h));',
          '  gl_FragColor = vec4(c, 1.0);',
          '}'
        ].join('\n')
      })
    );
    sky.position.set(TD.GRID_W / 2, 0, TD.GRID_H / 2);
    sky.renderOrder = -1;
    this.scene.add(sky);
    this.sky = sky;

    /* Disco solar y su halo, en la dirección de la luz principal. */
    var dir = new THREE.Vector3(1.3, 0.55, -0.32).normalize().multiplyScalar(170);
    var disc = new THREE.Mesh(
      new THREE.SphereGeometry(7, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false })
    );
    disc.position.copy(dir).add(sky.position);
    this.scene.add(disc);
    var halo = new THREE.Mesh(
      new THREE.SphereGeometry(20, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffe0a0, transparent: true, opacity: 0.18,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false
      })
    );
    halo.position.copy(disc.position);
    this.scene.add(halo);

    /* El propio cielo hace de mapa de entorno: metales y hielo dejan de
       verse planos sin coste de luces extra. */
    try {
      var pmrem = new THREE.PMREMGenerator(this.renderer);
      var envScene = new THREE.Scene();
      var envSky = sky.clone();
      envSky.position.set(0, 0, 0);
      envScene.add(envSky);
      this.scene.environment = pmrem.fromScene(envScene, 0.03).texture;
      pmrem.dispose();
    } catch (e) { /* sin entorno: el juego sigue igual */ }
  };

  /* Textura de hierba para el terreno que rodea al tablero. */
  function grassTexture() {
    var cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    var ctx = cv.getContext('2d');
    var rnd = TD.rng(1234);
    ctx.fillStyle = '#51713a';
    ctx.fillRect(0, 0, 256, 256);
    for (var i = 0; i < 700; i++) {
      ctx.globalAlpha = 0.05 + rnd() * 0.13;
      ctx.fillStyle = rnd() < 0.5 ? '#688b47' : '#42602f';
      ctx.beginPath();
      ctx.ellipse(rnd() * 256, rnd() * 256, 4 + rnd() * 22, 3 + rnd() * 14, rnd() * 3.14, 0, 6.28);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return cv;
  }

  /* Paisaje de fondo: campo, bosques, colinas, montañas, lago y nubes. */
  Renderer.prototype.buildWorld = function () {
    var THREE = window.THREE;
    var self = this;
    var cx = TD.GRID_W / 2, cz = TD.GRID_H / 2;
    var rnd = TD.rng(31415);

    var tex = new THREE.CanvasTexture(grassTexture());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(46, 46);
    var field = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(cx, -0.46, cz);
    field.receiveShadow = true;
    this.scene.add(field);

    /* Lago al fondo, con un material liso que recoge el cielo. */
    var lake = new THREE.Mesh(
      new THREE.CircleGeometry(11, 28),
      new THREE.MeshStandardMaterial({ color: 0x2f5c78, roughness: 0.12, metalness: 0.35 })
    );
    lake.rotation.x = -Math.PI / 2;
    lake.position.set(cx - 30, -0.42, cz - 34);
    lake.scale.set(1.7, 1, 1);
    this.scene.add(lake);
    var shore = new THREE.Mesh(
      new THREE.RingGeometry(10.4, 12.4, 28),
      new THREE.MeshStandardMaterial({ color: 0x8a7c58, roughness: 1 })
    );
    shore.rotation.x = -Math.PI / 2;
    shore.position.set(cx - 30, -0.44, cz - 34);
    shore.scale.set(1.7, 1, 1);
    this.scene.add(shore);

    /* Reparte piezas alrededor del tablero sin invadirlo. */
    function scatter(name, count, rMin, rMax, sMin, sMax, yBase) {
      for (var i = 0; i < count; i++) {
        for (var tries = 0; tries < 24; tries++) {
          var a = rnd() * TAU;
          var r = rMin + rnd() * (rMax - rMin);
          var x = cx + Math.cos(a) * r * 1.35;
          var z = cz + Math.sin(a) * r;
          if (Math.abs(x - cx) < 12.5 && Math.abs(z - cz) < 9.5) continue;
          var o = self.models[name].clone(true);
          o.position.set(x, yBase === undefined ? -0.46 : yBase, z);
          o.rotation.y = rnd() * TAU;
          o.scale.setScalar(sMin + rnd() * (sMax - sMin));
          o.traverse(function (n) { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; } });
          self.scene.add(o);
          break;
        }
      }
    }

    /* Cordillera al fondo: garantiza un perfil recortado en el horizonte. */
    for (var mi = 0; mi < 14; mi++) {
      var mount = this.models.env_mountain.clone(true);
      var mt = mi / 13;
      mount.position.set(
        cx - 70 + mt * 150 + (rnd() - 0.5) * 10,
        -0.46,
        cz - 46 - rnd() * 30
      );
      mount.rotation.y = rnd() * TAU;
      mount.scale.set(1.4 + rnd() * 1.2, 1.4 + rnd() * 1.2, 1.2 + rnd() * 1.2);
      mount.traverse(function (n) { if (n.isMesh) { n.castShadow = false; n.receiveShadow = false; } });
      this.scene.add(mount);
    }

    scatter('env_forest', 34, 13, 36, 0.8, 1.7);
    scatter('env_hill', 24, 15, 52, 1.0, 3.2);
    scatter('env_mountain', 18, 30, 74, 1.1, 2.6);
    scatter('env_ruin', 3, 14, 28, 0.7, 1.1);
    scatter('prop_pine', 46, 12, 24, 0.8, 1.4);
    scatter('prop_rock', 18, 12, 26, 0.9, 1.8);

    var mill = this.models.env_windmill.clone(true);
    mill.position.set(cx - 24, -0.46, cz - 16);
    mill.rotation.y = 0.8;
    mill.scale.setScalar(1.25);
    this.scene.add(mill);
    this.windmillBlades = findPart(mill, '__blades');

    /* Campamento de la horda, junto a la boca del camino. */
    var camp = this.models.env_camp.clone(true);
    camp.position.set(cx - 16, -0.46, cz - 7);
    camp.rotation.y = 0.7;
    camp.scale.setScalar(1.15);
    this.scene.add(camp);

    this.clouds = [];
    for (var c = 0; c < 12; c++) {
      var cloud = this.models.env_cloud.clone(true);
      cloud.position.set(cx + (rnd() - 0.5) * 150, 16 + rnd() * 12, cz - 10 - rnd() * 90);
      cloud.scale.setScalar(2 + rnd() * 4);
      cloud.traverse(function (n) {
        if (!n.isMesh) return;
        n.castShadow = false;
        n.material = n.material.clone();
        n.material.transparent = true;
        n.material.opacity = 0.9;
        n.material.fog = false;
      });
      this.scene.add(cloud);
      this.clouds.push({ obj: cloud, speed: 0.12 + rnd() * 0.22 });
    }
  };

  /* Grado de color final: contraste en S, un punto de saturación, viñeta y
     grano fino. Es lo que da el acabado de cámara al conjunto. */
  var GRADE_SHADER = {
    uniforms: {
      tDiffuse: { value: null },
      time: { value: 0 },
      contrast: { value: 1.04 },
      saturation: { value: 1.07 },
      vignette: { value: 0.95 },
      grain: { value: 0.022 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform float time; uniform float contrast; uniform float saturation;',
      'uniform float vignette; uniform float grain;',
      'varying vec2 vUv;',
      'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'void main() {',
      '  vec4 tex = texture2D(tDiffuse, vUv);',
      '  vec3 c = tex.rgb;',
      '  c = (c - 0.5) * contrast + 0.5;',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c = mix(vec3(l), c, saturation);',
      '  vec2 d = vUv - 0.5;',
      '  float v = smoothstep(0.85, vignette * 0.35, dot(d, d) * 2.0);',
      '  c *= mix(0.86, 1.0, v);',
      '  c += (hash(vUv * 1024.0 + fract(time)) - 0.5) * grain;',
      '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), tex.a);',
      '}'
    ].join('\n')
  };

  /* Post-procesado: oclusión ambiental, bloom y grado de color. */
  Renderer.prototype.buildComposer = function () {
    if (this.quality !== 'high' || !window.PostFX) return;
    var THREE = window.THREE;
    var FX = window.PostFX;
    var w0 = 960, h0 = 624;
    /* Destino multimuestreado: el post-procesado deja de comerse el antialias. */
    var rt = new THREE.WebGLRenderTarget(w0, h0, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new FX.EffectComposer(this.renderer, rt);
    this.composer.addPass(new FX.RenderPass(this.scene, this.camera));

    /* Nota: se probó oclusión ambiental en pantalla (GTAO), pero la cúpula de
       cielo envenena su prepaso de profundidad y mancha el plano con halos
       oscuros. El contacto con el suelo lo resuelven las sombras del sol. */

    this.bloom = new FX.UnrealBloomPass(new THREE.Vector2(w0, h0), 0.3, 0.62, 0.88);
    this.composer.addPass(this.bloom);

    this.grade = new FX.ShaderPass(GRADE_SHADER);
    this.composer.addPass(this.grade);

    this.composer.addPass(new FX.OutputPass());
  };

  /* Detalle del suelo: matas de hierba y china en las casillas libres.
     Van en dos mallas instanciadas, así que cuestan dos llamadas de dibujo. */
  Renderer.prototype.buildGroundDetail = function () {
    var THREE = window.THREE;
    var level = this.game.level;
    var rnd = TD.rng(8080);

    var free = [];
    for (var r = 0; r < TD.GRID_H; r++) {
      for (var c = 0; c < TD.GRID_W; c++) {
        if (level.blocked[level.idx(c, r)] === TD.BLOCK.FREE) free.push([c, r]);
      }
    }
    if (!free.length) return;

    var tuftCount = this.quality === 'high' ? free.length * 7 : free.length * 3;
    var blade = new THREE.ConeGeometry(0.035, 0.2, 3, 1, true);
    blade.translate(0, 0.1, 0);
    var tufts = new THREE.InstancedMesh(
      blade,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, side: THREE.DoubleSide, envMapIntensity: 0.15 }),
      tuftCount
    );
    var stoneCount = Math.round(free.length * 0.5);
    var stones = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.07, 0),
      new THREE.MeshStandardMaterial({ color: 0x8d8778, roughness: 0.95 }),
      stoneCount
    );
    stones.castShadow = true;
    stones.receiveShadow = true;

    var m = new THREE.Matrix4();
    var q = new THREE.Quaternion();
    var pos = new THREE.Vector3();
    var scl = new THREE.Vector3();
    var col = new THREE.Color();
    var i, tile;

    for (i = 0; i < tuftCount; i++) {
      tile = free[Math.floor(rnd() * free.length)];
      pos.set(tile[0] + 0.12 + rnd() * 0.76, 0, tile[1] + 0.12 + rnd() * 0.76);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * TAU);
      var h = 0.5 + rnd() * 0.7;
      scl.set(0.9 + rnd() * 0.7, h, 0.9 + rnd() * 0.7);
      m.compose(pos, q, scl);
      tufts.setMatrixAt(i, m);
      col.setHSL(0.23 + rnd() * 0.07, 0.42 + rnd() * 0.22, 0.17 + rnd() * 0.12);
      tufts.setColorAt(i, col);
    }
    for (i = 0; i < stoneCount; i++) {
      tile = free[Math.floor(rnd() * free.length)];
      pos.set(tile[0] + 0.15 + rnd() * 0.7, 0.02, tile[1] + 0.15 + rnd() * 0.7);
      q.setFromAxisAngle(new THREE.Vector3(rnd(), rnd(), rnd()).normalize(), rnd() * TAU);
      scl.setScalar(0.5 + rnd() * 0.9);
      m.compose(pos, q, scl);
      stones.setMatrixAt(i, m);
    }
    tufts.instanceMatrix.needsUpdate = true;
    if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    stones.instanceMatrix.needsUpdate = true;
    tufts.frustumCulled = false;
    stones.frustumCulled = false;
    this.scene.add(tufts);
    this.scene.add(stones);
  };

  Renderer.prototype.buildHelpers = function () {
    var THREE = window.THREE;

    /* Anillo de alcance de la torre seleccionada o fantasma. */
    this.rangeRing = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0xf0cf87, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
    );
    this.rangeRing.rotation.x = -Math.PI / 2;
    this.rangeRing.visible = false;
    this.scene.add(this.rangeRing);

    this.rangeDisc = new THREE.Mesh(
      new THREE.CircleGeometry(1, 48),
      new THREE.MeshBasicMaterial({ color: 0xf0cf87, transparent: true, opacity: 0.07, depthWrite: false })
    );
    this.rangeDisc.rotation.x = -Math.PI / 2;
    this.rangeDisc.visible = false;
    this.scene.add(this.rangeDisc);

    /* Casilla resaltada bajo el cursor. */
    this.tileMarker = new THREE.Mesh(
      new THREE.PlaneGeometry(0.94, 0.94),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false })
    );
    this.tileMarker.rotation.x = -Math.PI / 2;
    this.tileMarker.visible = false;
    this.scene.add(this.tileMarker);

    /* Partículas: un único objeto Points para todo. */
    var MAX_P = 900;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3));
    geo.setAttribute('psize', new THREE.BufferAttribute(new Float32Array(MAX_P), 1));
    var pmat = new THREE.PointsMaterial({
      size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, sizeAttenuation: true
    });
    /* Tamaño por partícula: pequeño parche sobre el shader estándar. */
    pmat.onBeforeCompile = function (shader) {
      shader.vertexShader = 'attribute float psize;\n' +
        shader.vertexShader.replace('gl_PointSize = size;', 'gl_PointSize = size * psize;');
    };
    this.points = new THREE.Points(geo, pmat);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
    this.maxParticles = MAX_P;

    /* Anillos de explosión / escarcha. */
    this.ringPool = [];
    for (var i = 0; i < 10; i++) {
      var r = new THREE.Mesh(
        new THREE.RingGeometry(0.72, 1, 28),
        new THREE.MeshBasicMaterial({ color: 0xffaa46, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
      );
      r.rotation.x = -Math.PI / 2;
      r.visible = false;
      this.scene.add(r);
      this.ringPool.push(r);
    }

    /* Rayos encadenados de las torres de tormenta. */
    this.boltPool = [];
    for (var lb = 0; lb < 8; lb++) {
      var geo2 = new THREE.BufferGeometry();
      geo2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      var line = new THREE.Line(geo2, new THREE.LineBasicMaterial({
        color: 0xbfe4ff, transparent: true, opacity: 0.9,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      line.frustumCulled = false;
      line.visible = false;
      this.scene.add(line);
      this.boltPool.push(line);
    }

    /* Llamaradas de la pira. */
    this.beamPool = [];
    var beamGeo = new THREE.CylinderGeometry(0.05, 0.16, 1, 6, 1, true);
    beamGeo.translate(0, 0.5, 0);
    for (var b = 0; b < 8; b++) {
      var beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({
        color: 0xff9a3c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
      }));
      beam.visible = false;
      this.scene.add(beam);
      this.beamPool.push(beam);
    }

    /* Barras de vida y marcas de estado, en geometría compartida. */
    this.barGeo = new THREE.PlaneGeometry(1, 1);
    this.barBgMat = new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false });
    this.barMats = {
      good: new THREE.MeshBasicMaterial({ color: 0x69b43f, depthTest: false, depthWrite: false }),
      mid: new THREE.MeshBasicMaterial({ color: 0xd9a441, depthTest: false, depthWrite: false }),
      low: new THREE.MeshBasicMaterial({ color: 0xc2422f, depthTest: false, depthWrite: false })
    };
    this.slowRingGeo = new THREE.RingGeometry(0.26, 0.34, 16);
    this.slowRingMat = new THREE.MeshBasicMaterial({ color: 0x9fdcf5, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false });
    this.burnMat = new THREE.MeshBasicMaterial({ color: 0xffa33c, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  };

  Renderer.prototype.buildStaticScenery = function () {
    var self = this;
    var level = this.game.level;
    var rnd = TD.rng(99);

    /* El paisaje de fondo también necesita los modelos ya cargados. */
    this.buildWorld();
    this.buildGroundDetail();

    var castle = this.models.prop_castle.clone(true);
    castle.position.set(18.62, 0, TD.GRID_H / 2);
    this.scene.add(castle);

    var gate = this.models.prop_gate.clone(true);
    gate.position.set(0.12, 0, 1.5);
    gate.rotation.y = Math.PI / 2;
    this.scene.add(gate);

    level.props.forEach(function (p) {
      var name = p.kind === 'rock' ? 'prop_rock' : (p.kind === 'pine' ? 'prop_pine' : 'prop_oak');
      var o = self.models[name].clone(true);
      var s = 0.82 + p.seed * 0.42;
      o.position.set(p.c + 0.5 + (rnd() - 0.5) * 0.22, 0, p.r + 0.5 + (rnd() - 0.5) * 0.22);
      o.rotation.y = p.seed * TAU;
      o.scale.setScalar(s);
      self.scene.add(o);
    });
  };

  /* ------------------------------------------------------------------ */
  /* Cámara y tamaño                                                     */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var width = Math.max(320, rect.width || this.canvas.clientWidth || 960);
    var height = Math.max(240, rect.height || this.canvas.clientHeight || 624);
    this.renderer.setSize(width, height, false);
    if (this.composer) this.composer.setSize(width, height);
    this.camera.aspect = width / height;
    this.fitCamera();
  };

  /* Coloca la cámara a la distancia mínima que deja todo el tablero a la vista.
   *
   * En vertical la escena gira un cuarto de vuelta: el lado largo del tablero
   * (20 casillas) cae por la pantalla y la fortaleza queda abajo, junto al
   * jugador, con la horda entrando por arriba.
   */
  Renderer.prototype.fitCamera = function () {
    var THREE = window.THREE;
    var portrait = this.camera.aspect < 1;
    this.portrait = portrait;

    var pitch = THREE.MathUtils.degToRad(portrait ? 48 : 36);
    var yaw = portrait ? Math.PI / 2 : 0;
    var dirH = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    var dir = new THREE.Vector3(dirH.x * Math.cos(pitch), Math.sin(pitch), dirH.z * Math.cos(pitch));

    /* El objetivo se corre por detrás del tablero para dejarlo en la mitad
       baja del encuadre y que arriba entre el paisaje. */
    this.camTarget.set(TD.GRID_W / 2, 0, TD.GRID_H / 2)
      .addScaledVector(dirH, portrait ? -1.4 : -2.6);

    var pts = [];
    [0.1, TD.GRID_W - 0.1].forEach(function (x) {
      [0.1, TD.GRID_H - 0.1].forEach(function (z) {
        pts.push(new THREE.Vector3(x, 0, z));
        pts.push(new THREE.Vector3(x, 1.5, z));
      });
    });
    /* La fortaleza sobresale del tablero y, en vertical, queda en primer
       plano: se añade su volumen al encuadre para que no la corte el borde. */
    var castleX = TD.GRID_W + (portrait ? 0.7 : 0.2);
    [4.2, TD.GRID_H - 4.2].forEach(function (z) {
      pts.push(new THREE.Vector3(castleX, 3.6, z));
      pts.push(new THREE.Vector3(castleX, 0, z));
    });

    var cam = this.camera;
    var target = this.camTarget;
    var lo = 6, hi = 90, best = hi;
    for (var it = 0; it < 26; it++) {
      var mid = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(dir, mid);
      cam.lookAt(target);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      var fits = pts.every(function (p) {
        var v = p.clone().project(cam);
        return Math.abs(v.x) < 0.995 && Math.abs(v.y) < 0.99 && v.z < 1;
      });
      if (fits) { best = mid; hi = mid; } else { lo = mid; }
    }
    /* Un poco más atrás de lo justo: así entra el horizonte en el plano. En
       vertical se aprieta más, que la pantalla da menos de sí. */
    cam.position.copy(target).addScaledVector(dir, best * (portrait ? 1.0 : 1.04));
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    this.camHome = cam.position.clone();
  };

  Renderer.prototype.shake = function (amount) {
    this.shakeAmount = Math.min(1, this.shakeAmount + amount);
  };

  /* ------------------------------------------------------------------ */
  /* Selección con el puntero                                            */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.pick = function (clientX, clientY) {
    var THREE = window.THREE;
    var rect = this.canvas.getBoundingClientRect();
    var ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster = this.raycaster || new THREE.Raycaster();
    this.raycaster.setFromCamera(ndc, this.camera);

    /* Primero las torres (tienen altura y tapan su propia casilla). */
    var groups = [];
    this.towerViews.forEach(function (v) { groups.push(v.group); });
    var hits = this.raycaster.intersectObjects(groups, true);
    if (hits.length) {
      var node = hits[0].object;
      while (node && !node.userData.tower) node = node.parent;
      if (node) return { col: node.userData.tower.col, row: node.userData.tower.row };
    }

    var plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    var hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, hit)) return null;
    var col = Math.floor(hit.x);
    var row = Math.floor(hit.z);
    if (col < 0 || col >= TD.GRID_W || row < 0 || row >= TD.GRID_H) return null;
    return { col: col, row: row };
  };

  /* ------------------------------------------------------------------ */
  /* Torres                                                              */
  /* ------------------------------------------------------------------ */

  function findPart(root, suffix) {
    var found = null;
    root.traverse(function (o) {
      if (!found && o.name && o.name.indexOf(suffix) >= 0) found = o;
    });
    return found;
  }

  var TOWER_SCALE = 1.42;

  Renderer.prototype.towerModelName = function (tower) {
    return tower.type.model;
  };

  Renderer.prototype.makeTowerView = function (tower) {
    var THREE = window.THREE;
    var model = this.models[this.towerModelName(tower)];
    var group = model.clone(true);
    group.position.set(w(tower.x), 0, w(tower.y));
    group.scale.setScalar(TOWER_SCALE);
    group.userData.tower = tower;
    this.scene.add(group);

    var view = {
      group: group,
      level: -1,
      yaw: findPart(group, '__yaw'),
      arm: findPart(group, '__arm'),
      flame: findPart(group, '__flame'),
      orb: findPart(group, '__orb'),
      marks: null,
      field: null
    };

    /* Los edificios pasivos enseñan su radio de influencia en todo momento. */
    if (tower.type.passive && tower.type.levels[0].range) {
      var col = tower.type.kind === 'aura' ? 0xf0cf87
        : tower.type.kind === 'slowfield' ? 0x9fdcf5
        : 0xd9a441;
      var field = new THREE.Mesh(
        new THREE.RingGeometry(0.965, 1, 48),
        new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.3,
          side: THREE.DoubleSide, depthWrite: false })
      );
      field.rotation.x = -Math.PI / 2;
      field.position.set(w(tower.x), 0.025, w(tower.y));
      this.scene.add(field);
      view.field = field;
    }
    return view;
  };

  /* Aros de nivel: la mejora se nota sin cambiar de modelo. */
  Renderer.prototype.updateTowerMarks = function (view, tower) {
    var THREE = window.THREE;
    if (view.marks) {
      view.group.remove(view.marks);
      view.marks.traverse(function (o) { if (o.isMesh) o.geometry.dispose(); });
    }
    view.level = tower.level;
    if (tower.level === 0) { view.marks = null; return; }

    var marks = new THREE.Group();
    this.goldMat = this.goldMat || new THREE.MeshStandardMaterial({
      color: 0xd9a441, roughness: 0.3, metalness: 0.9
    });
    var ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 6, 20), this.goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    marks.add(ring);

    if (tower.level >= 2) {
      var crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.075), this.goldMat);
      crown.position.y = 0.28;
      crown.position.x = 0.34;
      marks.add(crown);
      var crown2 = crown.clone();
      crown2.position.x = -0.34;
      marks.add(crown2);
    }
    marks.traverse(function (o) { if (o.isMesh) o.castShadow = true; });
    view.group.add(marks);
    view.marks = marks;
  };

  Renderer.prototype.syncTowers = function (dt) {
    var self = this;
    var seen = new Set();

    this.game.towers.forEach(function (tower) {
      seen.add(tower);
      var view = self.towerViews.get(tower);
      if (!view) {
        view = self.makeTowerView(tower);
        self.towerViews.set(tower, view);
      }
      if (view.level !== tower.level) self.updateTowerMarks(view, tower);
      if (view.field) {
        var fr = w(tower.stats().range);
        view.field.scale.setScalar(fr);
        view.field.material.opacity = 0.12 + Math.sin(self.time * 1.6 + tower.col) * 0.05;
      }
      if (view.yaw) view.yaw.rotation.y = yawFor(tower.angle);

      /* Retroceso al disparar. */
      var recoil = tower.recoil;
      if (view.arm) {
        view.arm.rotation.x = -1.15 + (1 - recoil) * 1.5;
      } else if (view.yaw) {
        view.yaw.position.z = -recoil * 0.06;
      }
      if (view.orb) {
        view.orb.rotation.y += dt * 1.4;
        view.orb.position.y = 0.02 + Math.sin(self.time * 2 + tower.col) * 0.04;
      }
      if (view.flame) {
        var f = 1 + Math.sin(self.time * 9 + tower.row) * 0.12;
        view.flame.scale.set(1, f, 1);
        view.flame.rotation.y = self.time * 1.6;
      }
      /* Aparición al construir o mejorar. */
      if (tower.buildAnim > 0) {
        var k = 1 - tower.buildAnim;
        view.group.scale.setScalar(TOWER_SCALE * (0.4 + 0.6 * k + Math.sin(k * Math.PI) * 0.16));
        view.group.position.y = -0.5 * tower.buildAnim;
      } else if (view.group.scale.x !== TOWER_SCALE) {
        view.group.scale.setScalar(TOWER_SCALE);
        view.group.position.y = 0;
      }
    });

    this.towerViews.forEach(function (view, tower) {
      if (seen.has(tower)) return;
      self.scene.remove(view.group);
      if (view.field) self.scene.remove(view.field);
      self.towerViews.delete(tower);
    });
  };

  /* ------------------------------------------------------------------ */
  /* Enemigos                                                            */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.makeEnemyView = function (enemy) {
    var THREE = window.THREE;
    var model = this.models['enemy_' + enemy.type.key];
    var group = model.clone(true);
    group.scale.setScalar(enemy.type.modelScale || 1);
    this.scene.add(group);

    var bar = new THREE.Group();
    var bg = new THREE.Mesh(this.barGeo, this.barBgMat);
    bg.scale.set(0.62, 0.1, 1);
    var fill = new THREE.Mesh(this.barGeo, this.barMats.good);
    fill.scale.set(0.58, 0.07, 1);
    fill.position.z = 0.001;
    bar.add(bg);
    bar.add(fill);
    bar.renderOrder = 20;
    bar.visible = false;
    this.scene.add(bar);

    return {
      group: group,
      bar: bar,
      fill: fill,
      body: findPart(group, '__body'),
      legL: findPart(group, '__legL'),
      legR: findPart(group, '__legR'),
      legs: ['__legA', '__legB', '__legC', '__legD'].map(function (n) { return findPart(group, n); }),
      wingL: findPart(group, '__wingL'),
      wingR: findPart(group, '__wingR'),
      slowRing: null,
      burn: null
    };
  };

  Renderer.prototype.syncEnemies = function (dt) {
    var THREE = window.THREE;
    var self = this;
    var seen = new Set();

    this.game.enemies.forEach(function (enemy) {
      seen.add(enemy);
      var view = self.enemyViews.get(enemy);
      if (!view) {
        view = self.makeEnemyView(enemy);
        self.enemyViews.set(enemy, view);
      }
      var type = enemy.type;
      var height = type.flying ? 1.05 + Math.sin(self.time * 2.2 + enemy.walk) * 0.09 : 0;
      view.group.position.set(w(enemy.x), height, w(enemy.y));
      view.group.rotation.y = yawFor(enemy.angle);

      var swing = Math.sin(enemy.walk * 7) * 0.6;
      if (view.legL) view.legL.rotation.x = swing;
      if (view.legR) view.legR.rotation.x = -swing;
      view.legs.forEach(function (leg, i) {
        if (leg) leg.rotation.x = Math.sin(enemy.walk * 9 + i * 1.6) * 0.7;
      });
      if (view.body) {
        view.body.position.y = (view.body.userData.baseY === undefined
          ? (view.body.userData.baseY = view.body.position.y)
          : view.body.userData.baseY) + Math.abs(Math.sin(enemy.walk * 7)) * 0.035;
        if (type.flying) view.body.rotation.x = Math.sin(self.time * 3) * 0.06;
      }
      if (view.wingL) {
        var flap = Math.sin(self.time * 7 + enemy.walk) * 0.75;
        view.wingL.rotation.z = -flap;
        view.wingR.rotation.z = flap;
      }

      /* Golpe recibido: pequeño rebote de escala. */
      var punch = enemy.flash > 0 ? 1 + enemy.flash * 1.2 : 1;
      view.group.scale.setScalar((type.modelScale || 1) * punch);

      /* Barra de vida orientada a cámara. */
      var hurt = enemy.hp < enemy.maxHp;
      view.bar.visible = hurt;
      if (hurt) {
        var ratio = Math.max(0, enemy.hp / enemy.maxHp);
        var top = height + w(type.radius) * 2.3 + (type.boss ? 0.55 : 0.25);
        view.bar.position.set(w(enemy.x), top, w(enemy.y));
        view.bar.quaternion.copy(self.camera.quaternion);
        var width = type.boss ? 1.15 : 0.62;
        view.bar.children[0].scale.set(width, type.boss ? 0.14 : 0.1, 1);
        view.fill.scale.set((width - 0.04) * ratio, type.boss ? 0.1 : 0.07, 1);
        view.fill.position.x = -((width - 0.04) * (1 - ratio)) / 2;
        view.fill.material = ratio > 0.55 ? self.barMats.good : (ratio > 0.28 ? self.barMats.mid : self.barMats.low);
      }

      /* Marcas de estado. */
      if (enemy.slow > 0 && !view.slowRing) {
        view.slowRing = new THREE.Mesh(self.slowRingGeo, self.slowRingMat);
        view.slowRing.rotation.x = -Math.PI / 2;
        self.scene.add(view.slowRing);
      }
      if (view.slowRing) {
        view.slowRing.visible = enemy.slow > 0;
        view.slowRing.position.set(w(enemy.x), height + 0.03, w(enemy.y));
        view.slowRing.scale.setScalar(w(type.radius) * 3.2);
      }
      if (enemy.burnTimer > 0 && !view.burn) {
        view.burn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 6), self.burnMat);
        self.scene.add(view.burn);
      }
      if (view.burn) {
        view.burn.visible = enemy.burnTimer > 0;
        view.burn.position.set(w(enemy.x), height + w(type.radius) * 2 + 0.1, w(enemy.y));
        var s = 0.8 + Math.sin(self.time * 14 + enemy.walk) * 0.25;
        view.burn.scale.set(s, 1 + s * 0.3, s);
      }
    });

    this.enemyViews.forEach(function (view, enemy) {
      if (seen.has(enemy)) return;
      self.scene.remove(view.group);
      self.scene.remove(view.bar);
      if (view.slowRing) self.scene.remove(view.slowRing);
      if (view.burn) { self.scene.remove(view.burn); view.burn.geometry.dispose(); }
      self.enemyViews.delete(enemy);
    });
  };

  /* ------------------------------------------------------------------ */
  /* Proyectiles y efectos                                               */
  /* ------------------------------------------------------------------ */

  var PROJ_MODEL = {
    arrow: 'proj_arrow', bolt: 'proj_bolt', rock: 'proj_rock',
    frost: 'proj_orb', poison: 'proj_orb'
  };

  Renderer.prototype.syncProjectiles = function () {
    var self = this;
    var seen = new Set();

    this.game.projectiles.forEach(function (p) {
      seen.add(p);
      var view = self.projViews.get(p);
      if (!view) {
        view = self.models[PROJ_MODEL[p.kind]].clone(true);
        if (p.kind === 'poison') {
          self.poisonMat = self.poisonMat || new window.THREE.MeshStandardMaterial({
            color: 0xa8e04a, emissive: 0x6fb020, emissiveIntensity: 1.6, roughness: 0.4
          });
          view.traverse(function (o) { if (o.isMesh) o.material = self.poisonMat; });
        }
        self.scene.add(view);
        self.projViews.set(p, view);
      }
      var height = 0.55;
      if (p.kind === 'rock') {
        /* La piedra ya describe una parábola en el plano del juego: aquí la
           parábola se convierte en altura real. */
        var t = TD.clamp(p.life / p.duration, 0, 1);
        var gx = TD.lerp(p.sx, p.tx, t);
        var gy = TD.lerp(p.sy, p.ty, t);
        view.position.set(w(gx), 0.4 + Math.sin(t * Math.PI) * w(p.arc) * 1.4, w(gy));
        view.rotation.x += 0.22;
        view.rotation.z += 0.14;
        return;
      }
      view.position.set(w(p.x), height, w(p.y));
      view.rotation.y = yawFor(p.angle || 0);
      if (p.kind === 'frost' || p.kind === 'poison') {
        view.rotation.x += 0.1;
        view.position.y = height + Math.sin(p.life * 12) * 0.04;
      }
    });

    this.projViews.forEach(function (view, p) {
      if (seen.has(p)) return;
      self.scene.remove(view);
      self.projViews.delete(p);
    });
  };

  Renderer.prototype.syncEffects = function () {
    var fx = this.game.effects;
    var geo = this.points.geometry;
    var pos = geo.attributes.position.array;
    var col = geo.attributes.color.array;
    var siz = geo.attributes.psize.array;
    var n = Math.min(fx.particles.length, this.maxParticles);
    var tmp = this._tmpColor || (this._tmpColor = new window.THREE.Color());

    for (var i = 0; i < n; i++) {
      var p = fx.particles[i];
      pos[i * 3] = w(p.x);
      pos[i * 3 + 1] = (p.h === undefined ? 0.35 : p.h) + w(p.riseY || 0);
      pos[i * 3 + 2] = w(p.y);
      tmp.set(p.color3 || (p.color3 = colorOf(p.color)));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      siz[i] = Math.max(0.1, p.size * (p.life / p.max) * (p.smoke ? 1.6 : 1)) * 0.55;
    }
    geo.setDrawRange(0, n);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.psize.needsUpdate = true;

    for (var r = 0; r < this.ringPool.length; r++) {
      var ring = this.ringPool[r];
      var data = fx.rings[r];
      if (!data) { ring.visible = false; continue; }
      ring.visible = true;
      ring.position.set(w(data.x), (data.h === undefined ? 0.08 : data.h), w(data.y));
      ring.scale.setScalar(Math.max(0.01, w(data.r)));
      ring.material = ring.material;
      ring.material.color.set(data.color.indexOf('150,220,250') >= 0 ? 0x96dcfa : 0xffaa46);
      ring.material.opacity = Math.max(0, data.life / data.maxLife) * 0.85;
    }

    /* Rayos activos. */
    for (var b = 0; b < this.boltPool.length; b++) {
      var line = this.boltPool[b];
      var data = fx.bolts[b];
      if (!data) { line.visible = false; continue; }
      var arr = line.geometry.attributes.position.array;
      var n = Math.min(data.points.length, 8);
      for (var q = 0; q < n; q++) {
        arr[q * 3] = w(data.points[q].x);
        arr[q * 3 + 1] = data.points[q].h + 0.25;
        arr[q * 3 + 2] = w(data.points[q].y);
      }
      line.geometry.setDrawRange(0, n);
      line.geometry.attributes.position.needsUpdate = true;
      line.material.opacity = Math.max(0, data.life / data.max);
      line.visible = true;
    }

    /* Chorros de fuego de las piras activas. */
    var beamIdx = 0;
    var self = this;
    this.game.towers.forEach(function (tower) {
      if (!tower.beam || beamIdx >= self.beamPool.length) return;
      var beam = self.beamPool[beamIdx++];
      var from = new window.THREE.Vector3(w(tower.x), 0.95, w(tower.y));
      var to = new window.THREE.Vector3(w(tower.beam.x), tower.beam.type.flying ? 1.05 : 0.3, w(tower.beam.y));
      var dir = to.clone().sub(from);
      var len = dir.length();
      beam.visible = true;
      beam.position.copy(from);
      beam.scale.set(1, len, 1);
      beam.quaternion.setFromUnitVectors(new window.THREE.Vector3(0, 1, 0), dir.normalize());
      beam.material.opacity = 0.4 + Math.random() * 0.25;
    });
    for (; beamIdx < this.beamPool.length; beamIdx++) this.beamPool[beamIdx].visible = false;
  };

  var COLOR_CACHE = {};
  function colorOf(css) {
    if (COLOR_CACHE[css]) return COLOR_CACHE[css];
    var c = css;
    if (css.charAt(0) === 'r') {
      var m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      c = m ? ((+m[1] << 16) | (+m[2] << 8) | (+m[3])) : 0xffffff;
    }
    COLOR_CACHE[css] = c;
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* Indicadores de construcción                                         */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.syncCursor = function () {
    var game = this.game;
    var hover = game.hover;
    var ghostName = null;
    var ring = null;

    if (game.buildType && hover) {
      var type = TD.TOWER_TYPES[game.buildType];
      var ok = game.canBuild(hover.col, hover.row) && game.gold >= type.cost;
      ghostName = type.model;
      ring = { x: hover.col + 0.5, z: hover.row + 0.5, r: w(game.towerRange(type, 0)), color: ok ? 0x8fdc6a : 0xe06450 };
      this.tileMarker.visible = true;
      this.tileMarker.position.set(hover.col + 0.5, 0.02, hover.row + 0.5);
      this.tileMarker.material.color.setHex(ok ? 0x9fe97a : 0xe06450);
    } else if (game.selected) {
      var t = game.selected;
      ring = { x: w(t.x), z: w(t.y), r: w(t.stats().range), color: 0xf0cf87 };
      this.tileMarker.visible = false;
    } else {
      this.tileMarker.visible = false;
    }

    if (ghostName) {
      if (!this.ghost || this.ghostName !== ghostName) {
        if (this.ghost) this.scene.remove(this.ghost);
        this.ghost = this.models[ghostName].clone(true);
        this.ghost.traverse(function (o) {
          if (!o.isMesh) return;
          o.castShadow = false;
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.55;
          o.material.depthWrite = false;
        });
        this.ghostName = ghostName;
        this.scene.add(this.ghost);
      }
      this.ghost.visible = true;
      this.ghost.scale.setScalar(TOWER_SCALE);
      this.ghost.position.set(hover.col + 0.5, 0, hover.row + 0.5);
    } else if (this.ghost) {
      this.ghost.visible = false;
    }

    if (ring) {
      this.rangeRing.visible = this.rangeDisc.visible = true;
      this.rangeRing.position.set(ring.x, 0.035, ring.z);
      this.rangeDisc.position.set(ring.x, 0.03, ring.z);
      this.rangeRing.scale.setScalar(ring.r);
      this.rangeDisc.scale.setScalar(ring.r);
      this.rangeRing.material.color.setHex(ring.color);
      this.rangeDisc.material.color.setHex(ring.color);
    } else {
      this.rangeRing.visible = this.rangeDisc.visible = false;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Rótulos flotantes (DOM sobre el lienzo)                             */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.attachTextLayer = function (el) {
    this.textLayer = el;
    this.textPool = [];
  };

  Renderer.prototype.syncTexts = function () {
    if (!this.textLayer) return;
    var THREE = window.THREE;
    var texts = this.game.effects.texts;
    var rect = this.canvas.getBoundingClientRect();
    var v = this._tmpVec || (this._tmpVec = new THREE.Vector3());

    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      var el = this.textPool[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'fx-text';
        this.textLayer.appendChild(el);
        this.textPool.push(el);
      }
      v.set(w(t.x), (t.h === undefined ? 0.8 : t.h) + (t.max - t.life) * 1.1, w(t.y));
      v.project(this.camera);
      if (el._txt !== t.text) { el.textContent = t.text; el._txt = t.text; }
      if (el._col !== t.color) { el.style.color = t.color; el._col = t.color; }
      el.style.fontSize = t.size + 'px';
      el.style.transform = 'translate(-50%,-50%) translate(' +
        ((v.x * 0.5 + 0.5) * rect.width).toFixed(1) + 'px,' +
        ((-v.y * 0.5 + 0.5) * rect.height).toFixed(1) + 'px)';
      el.style.opacity = Math.min(1, t.life / t.max * 1.8);
      el.style.display = v.z > 1 ? 'none' : 'block';
    }
    for (var j = texts.length; j < this.textPool.length; j++) this.textPool[j].style.display = 'none';
  };

  /* ------------------------------------------------------------------ */
  /* Bucle                                                               */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.frame = function (dt) {
    if (!this.ready) return;
    this.time += dt;
    this.syncTowers(dt);
    this.syncEnemies(dt);
    this.syncProjectiles();
    this.syncEffects();
    this.syncCursor();
    this.syncTexts();

    if (this.shakeAmount > 0.001) {
      this.shakeAmount = Math.max(0, this.shakeAmount - dt * 2.2);
      var k = this.shakeAmount * this.shakeAmount * 0.5;
      this.camera.position.set(
        this.camHome.x + (Math.random() - 0.5) * k,
        this.camHome.y + (Math.random() - 0.5) * k,
        this.camHome.z + (Math.random() - 0.5) * k
      );
      this.camera.lookAt(this.camTarget);
    } else if (this.camHome && !this.camera.position.equals(this.camHome)) {
      this.camera.position.copy(this.camHome);
      this.camera.lookAt(this.camTarget);
    }

    if (this.windmillBlades) this.windmillBlades.rotation.x += dt * 0.55;
    if (this.clouds) {
      var limit = TD.GRID_W / 2 + 85;
      for (var c = 0; c < this.clouds.length; c++) {
        var cl = this.clouds[c];
        cl.obj.position.x += cl.speed * dt;
        if (cl.obj.position.x > limit) cl.obj.position.x = TD.GRID_W / 2 - 85;
      }
    }

    if (this.grade) this.grade.uniforms.time.value = this.time;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  };

  Renderer.prototype.resetViews = function () {
    var self = this;
    this.towerViews.forEach(function (v) {
      self.scene.remove(v.group);
      if (v.field) self.scene.remove(v.field);
    });
    this.towerViews.clear();
    this.enemyViews.forEach(function (v) {
      self.scene.remove(v.group);
      self.scene.remove(v.bar);
      if (v.slowRing) self.scene.remove(v.slowRing);
      if (v.burn) self.scene.remove(v.burn);
    });
    this.enemyViews.clear();
    this.projViews.forEach(function (v) { self.scene.remove(v); });
    this.projViews.clear();
    if (this.textPool) this.textPool.forEach(function (el) { el.style.display = 'none'; });
  };

  /* ------------------------------------------------------------------ */
  /* Iconos para la interfaz                                             */
  /* ------------------------------------------------------------------ */

  Renderer.prototype.icon = function (modelName, size) {
    var THREE = window.THREE;
    size = size || 88;
    if (!this.iconRenderer) {
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      this.iconRenderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
      this.iconRenderer.setPixelRatio(1);
      this.iconRenderer.outputColorSpace = THREE.SRGBColorSpace;
      this.iconScene = new THREE.Scene();
      this.iconScene.add(new THREE.HemisphereLight(0xcfe4ff, 0x3a3020, 2.4));
      var key = new THREE.DirectionalLight(0xfff0d0, 2.6);
      key.position.set(2, 4, 3);
      this.iconScene.add(key);
      this.iconCam = new THREE.PerspectiveCamera(30, 1, 0.1, 40);
    }
    var model = this.models[modelName];
    if (!model) return null;

    var clone = model.clone(true);
    this.iconScene.add(clone);
    var box = new THREE.Box3().setFromObject(clone);
    var center = box.getCenter(new THREE.Vector3());
    var radius = box.getSize(new THREE.Vector3()).length() / 2;
    var dist = radius / Math.sin(THREE.MathUtils.degToRad(15));
    this.iconCam.position.set(center.x + dist * 0.52, center.y + dist * 0.5, center.z + dist * 0.7);
    this.iconCam.lookAt(center);
    this.iconRenderer.setSize(size, size, false);
    this.iconRenderer.render(this.iconScene, this.iconCam);
    var url = this.iconRenderer.domElement.toDataURL('image/png');
    this.iconScene.remove(clone);
    return url;
  };

  TD.Renderer3D = Renderer;
})(window.TD = window.TD || {});
