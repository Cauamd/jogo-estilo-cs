import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {MAP, obstacles} from '../shared/map';
import {surface, sign, box, bevelBox, cylinder} from '../graphics/Materials';
import {pbrMaterial, canvasTexture} from '../graphics/TextureFactory';

export class IndustrialDistrict {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  pointLights: THREE.PointLight[] = [];

  constructor(public scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    scene.add(this.group);
    scene.background = new THREE.Color('#98b4bd');
    scene.fog = new THREE.FogExp2('#9eb2b7', .0062);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, .04);
    scene.environment = env.texture;
    scene.environmentIntensity = .42;
    pmrem.dispose();
    room.dispose();

    const sky = new Sky();
    sky.scale.setScalar(1000);
    const su = sky.material.uniforms;
    su.turbidity.value = 3.2;
    su.rayleigh.value = 1.65;
    su.mieCoefficient.value = .004;
    su.mieDirectionalG.value = .84;
    su.sunPosition.value.set(-.55, .42, -.38);
    scene.add(sky);

    // Balanced daytime key light + crisp sky/ground hemisphere fill
    this.sun = new THREE.DirectionalLight('#ffdfba', 2.65);
    this.sun.position.set(-26, 40, 22);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {left: -42, right: 42, top: 42, bottom: -42, near: 1, far: 110});
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.shadow.bias = -.00035;
    this.sun.shadow.normalBias = .028;
    scene.add(this.sun);

    this.hemi = new THREE.HemisphereLight('#bddfeb', '#554f44', .78);
    scene.add(this.hemi);

    // Material palette (PBR with normal, roughness & AO maps)
    const asphalt = surface('#545c5a', 'asphalt', 14, 16);
    const concreteRoad = surface('#767b76', 'concreteSmooth', 8, 8);
    const concrete = surface('#a4a296', 'concretePanel', 1, 1);
    const concreteWarm = surface('#ada696', 'concretePanel', 1, 1);
    const concreteCool = surface('#929a98', 'concreteSmooth', 1, 1);
    const dark = surface('#555e5e', 'concreteSmooth', 1, 1);
    const steel = surface('#3c5256', 'paintedMetal', 1, 1);
    const darkSteel = pbrMaterial('brushed', {color: '#283234', metalness: .82, roughness: .46});
    const tread = surface('#5a6668', 'treadPlate', 2, 2);
    const wood = surface('#987e5c', 'woodPlanks', 1, 1);
    const orange = pbrMaterial('paintedMetal', {color: '#c9783b', roughness: .52, metalness: .38});
    const tealMetal = surface('#386167', 'corrugated', 2, 1);
    const rustMetal = surface('#a65c3e', 'corrugated', 2, 1);
    const pale = pbrMaterial('concreteSmooth', {color: '#c8c6b4', roughness: .82});
    const black = pbrMaterial('polymer', {color: '#222a2a', roughness: .75});
    const windowGlass = pbrMaterial('glassGrime', {color: '#2b454c', metalness: .85, roughness: .18, envMapIntensity: 1.6});
    const warehouseRoof = surface('#6f7e7a', 'roofMetal', 6, 4);

    // Hazard stripe decal material
    const hazardTex = canvasTexture(256, 64, c => {
      c.fillStyle = '#d8a43a';
      c.fillRect(0, 0, 256, 64);
      c.fillStyle = '#202626';
      for (let i = -64; i < 320; i += 32) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + 16, 0);
        c.lineTo(i - 16, 64);
        c.lineTo(i - 32, 64);
        c.closePath();
        c.fill();
      }
    });
    hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
    const hazardMat = new THREE.MeshStandardMaterial({map: hazardTex, roughness: .75});
    hazardMat.userData.shared = true;

    // 1. Primary Asphalt Floor + Zoning Concrete Aprons
    box(this.group, 0, -.1, 0, 65, .2, 77, asphalt, false);
    // Warehouse concrete slab, central equipment pad, and spawn aprons
    box(this.group, -22, -.088, 0, 13.2, .18, 20.6, concreteRoad, false);
    box(this.group, 0, -.088, 0, 9.2, .18, 11.2, concreteRoad, false);
    box(this.group, 0, -.088, 30, 16, .18, 9, concreteRoad, false);
    box(this.group, 0, -.088, -30, 16, .18, 9, concreteRoad, false);

    // 2. Obstacles (preserving 100% of positions & dimensions from shared/map.ts)
    let wallIdx = 0;
    for (const o of obstacles) {
      if (o.kind === 'crate') {
        // Bevelled industrial crate with steel corner frames & cross braces
        bevelBox(this.group, o.x, o.y, o.z, o.w, o.h, o.d, wood, .04, .8);
        for (const y of [o.y - o.h / 2 + .09, o.y + o.h / 2 - .09]) {
          bevelBox(this.group, o.x, y, o.z, o.w + .06, .11, o.d + .06, steel, .018, 1);
        }
        for (const sx of [-.46, .46]) {
          for (const sz of [-.46, .46]) {
            box(this.group, o.x + sx * o.w, o.y, o.z + sz * o.d, .09, o.h + .02, .09, steel);
          }
        }
        for (const side of [-1, 1]) {
          const cross = box(this.group, o.x, o.y, o.z + side * (o.d / 2 + .025), o.w * .82, .11, .04, wood);
          cross.rotation.z = .38 * side;
        }
        continue;
      }

      if (o.kind === 'container') {
        const isOrange = o.color === 0xa65632;
        const cMat = isOrange ? rustMetal : tealMetal;
        const frameMat = isOrange ? orange : steel;
        bevelBox(this.group, o.x, o.y, o.z, o.w, o.h, o.d, cMat, .05, .45);
        // Structural top/bottom rails & corner posts
        for (const sy of [-1, 1]) {
          box(this.group, o.x, o.y + sy * (o.h / 2 - .06), o.z, o.w + .05, .12, o.d + .05, frameMat);
        }
        for (const sx of [-1, 1]) {
          for (const sz of [-1, 1]) {
            box(this.group, o.x + sx * (o.w / 2 - .06), o.y, o.z + sz * (o.d / 2 - .06), .16, o.h + .04, .16, pale);
          }
        }
        // Corrugated ribs along sides
        for (const side of [-1, 1]) {
          for (let z = o.z - o.d / 2 + .35; z < o.z + o.d / 2 - .2; z += .44) {
            box(this.group, o.x + side * (o.w / 2 + .018), o.y, z, .05, o.h - .26, .14, cMat);
          }
        }
        // Container door locking bars on both ends
        for (const end of [-1, 1]) {
          for (const barX of [-.95, -.35, .35, .95]) {
            cylinder(this.group, o.x + barX, o.y, o.z + end * (o.d / 2 + .045), .026, o.h - .24, pale, 'y', 10);
          }
        }
        const label = isOrange ? 'V G D  /  204' : 'S P C  /  081';
        const s = new THREE.Mesh(new THREE.PlaneGeometry(2.7, .62), sign(label, '#e4e8dc', isOrange ? '#6e3822' : '#28474c'));
        s.position.set(o.x, o.y + .35, o.z + o.d / 2 + .045);
        this.group.add(s);
        continue;
      }

      if (o.kind === 'tank') {
        // Central compressor tank platform + detailed pressure vessels
        bevelBox(this.group, o.x, o.y - .45, o.z, o.w, o.h - .9, o.d, dark, .05, .6);
        bevelBox(this.group, o.x, o.y - o.h / 2 + .18, o.z, o.w + .14, .12, o.d + .14, tread, .02, 1);
        continue;
      }

      if (o.kind === 'step') {
        bevelBox(this.group, o.x, o.y, o.z, o.w, o.h, o.d, dark, .02, .8);
        box(this.group, o.x, o.y + o.h / 2 - .02, o.z, o.w + .02, .04, o.d + .02, tread);
        continue;
      }

      if (o.kind === 'concrete') {
        bevelBox(this.group, o.x, o.y, o.z, o.w, o.h, o.d, concreteCool, .045, .5);
        bevelBox(this.group, o.x, o.h - .05, o.z, o.w + .08, .1, o.d + .08, dark, .02, .8);
        box(this.group, o.x, .08, o.z, o.w + .06, .14, o.d + .06, hazardMat, false);
        continue;
      }

      // Walls & Buildings
      wallIdx++;
      const wallMat = wallIdx % 3 === 0 ? concreteWarm : wallIdx % 2 === 0 ? concreteCool : concrete;
      bevelBox(this.group, o.x, o.y, o.z, o.w, o.h, o.d, wallMat, .04, .35);
      // Top coping & bottom plinth on all walls
      box(this.group, o.x, o.h - .08, o.z, o.w + .08, .16, o.d + .08, dark);
      box(this.group, o.x, .22, o.z, o.w + .06, .44, o.d + .06, dark);

      // Perimeter wall pilasters & conduit pipes
      if (o.w === 1 && o.d > 40) {
        const inward = o.x < 0 ? 1 : -1;
        for (let z = -32; z <= 32; z += 8) {
          box(this.group, o.x + inward * .55, o.h / 2, z, .22, o.h, .36, dark);
          box(this.group, o.x + inward * .66, o.h / 2, z, .08, o.h - .4, .18, steel);
        }
        cylinder(this.group, o.x + inward * .56, 4.8, 0, .065, 72, steel, 'z', 10);
        cylinder(this.group, o.x + inward * .56, 5.25, 0, .045, 72, orange, 'z', 10);
      }

      // Main lane buildings (4x 8x15 blocks)
      if (o.w > 3 && o.d > 4 && o.w < 20) {
        bevelBox(this.group, o.x, o.h + .16, o.z, o.w + .34, .32, o.d + .34, dark, .03, .5);
        box(this.group, o.x, .55, o.z, o.w + .1, 1.1, o.d + .1, dark);
        // Rooftop HVAC & exhaust units
        bevelBox(this.group, o.x - 1.4, o.h + .75, o.z - 2.5, 2.2, .9, 2.8, steel, .04, 1);
        cylinder(this.group, o.x + 1.6, o.h + .9, o.z + 2.2, .55, 1.2, darkSteel, 'y', 14);

        for (const side of [-1, 1]) {
          // Industrial multi-pane windows with recessed frames, mullions & sill
          for (let z = o.z - o.d / 2 + 2.2; z < o.z + o.d / 2 - 1; z += 3.2) {
            const wx = o.x + side * (o.w / 2 + .02);
            box(this.group, wx, 3.6, z, .05, 1.65, 1.55, windowGlass);
            box(this.group, wx + side * .03, 3.6, z, .09, 1.75, .08, darkSteel);
            box(this.group, wx + side * .03, 3.6, z, .09, .08, 1.65, darkSteel);
            box(this.group, wx + side * .04, 2.7, z, .14, .1, 1.75, pale);
            box(this.group, wx + side * .04, 4.5, z, .14, .1, 1.75, steel);
          }
          // Corner downspouts & straps
          for (const cz of [o.z - o.d / 2 + .35, o.z + o.d / 2 - .35]) {
            cylinder(this.group, o.x + side * (o.w / 2 + .12), o.h / 2, cz, .075, o.h, steel, 'y', 12);
          }
        }
        const title = o.z > 0 ? (o.x < 0 ? 'LOGISTICS / 04' : 'SECTOR / 03') : (o.x < 0 ? 'ASSEMBLY / 02' : 'TURBINE / 01');
        const placard = new THREE.Mesh(new THREE.PlaneGeometry(3.8, .92), sign(title, '#dce6e1', '#183438'));
        placard.position.set(o.x, 4.6, o.z + (o.z > 0 ? -1 : 1) * (o.d / 2 + .055));
        if (o.z > 0) placard.rotation.y = Math.PI;
        this.group.add(placard);
      }
    }

    // 3. Open West Warehouse Structure: columns, roof trusses, skylight & warm lamps
    bevelBox(this.group, -22, 5.82, 0, 13.2, .24, 21.2, warehouseRoof, .03, .4);
    for (const z of [-9, -3, 3, 9]) {
      for (const x of [-28, -16]) {
        box(this.group, x, 2.8, z, .28, 5.6, .28, orange);
        box(this.group, x, .25, z, .42, .5, .42, darkSteel);
      }
      box(this.group, -22, 5.46, z, 12.2, .22, .22, steel);
      const beam = box(this.group, -22, 5.05, z, 12, .11, .11, darkSteel);
      beam.rotation.z = .065;
    }
    const lampEmissive = new THREE.MeshStandardMaterial({color: '#fff2d8', emissive: '#ffcf8c', emissiveIntensity: 2.2});
    lampEmissive.userData.shared = true;
    for (const z of [-5, 5]) {
      bevelBox(this.group, -22, 5.56, z, 2.2, .12, .42, darkSteel, .02, 1);
      box(this.group, -22, 5.48, z, 2.0, .06, .3, lampEmissive, false);
      const light = new THREE.PointLight('#ffd699', 6.5, 14, 1.8);
      light.position.set(-22, 4.7, z);
      scene.add(light);
      this.pointLights.push(light);
    }

    // 4. Central Compressor Tanks, Domed Caps, Pipework & Gantry Crane
    const capGeo = new THREE.SphereGeometry(.44, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    capGeo.userData.shared = true;
    for (const x of [-1.2, 0, 1.2]) {
      cylinder(this.group, x, 3.7, 0, .44, 4.1, steel, 'z', 20);
      for (const dir of [-1, 1]) {
        const cap = new THREE.Mesh(capGeo, steel);
        cap.position.set(x, 3.7, dir * 2.05);
        cap.rotation.x = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        cap.castShadow = cap.receiveShadow = true;
        this.group.add(cap);
        cylinder(this.group, x, 3.7, dir * 1.4, .475, .14, orange, 'z', 20);
        box(this.group, x, 3.05, dir * 1.4, .7, .55, .22, darkSteel);
      }
      // Top manifold pipe & valve wheel
      cylinder(this.group, x, 4.28, 0, .08, .3, darkSteel, 'y', 10);
      cylinder(this.group, x, 4.44, 0, .18, .03, orange, 'y', 12);
    }
    cylinder(this.group, 0, 4.35, 0, .07, 2.8, orange, 'x', 12);

    // Overhead Orange Gantry Crane
    for (const x of [-5.5, 5.5]) {
      box(this.group, x, 3.9, -1, .3, 7.8, .3, orange);
      box(this.group, x, .3, -1, .52, .6, .52, darkSteel);
    }
    bevelBox(this.group, 0, 7.6, -1, 11.7, .58, .5, orange, .03, .6);
    box(this.group, 0, 7.15, -1, .9, .38, .65, darkSteel);
    const craneText = new THREE.Mesh(new THREE.PlaneGeometry(5.2, .42), sign('SPECTRA  /  INDUSTRIAL', '#f2efe2', '#b36830'));
    craneText.position.set(0, 7.62, -.73);
    this.group.add(craneText);

    // 5. Overhead Utility Pipe Bridges on Outer Lanes
    for (const x of [-22, 22]) {
      for (const z of [-12, 12]) {
        for (const sx of [-5, 5]) box(this.group, x + sx, 3.5, z, .22, 7, .22, steel);
        box(this.group, x, 6.8, z, 10.4, .24, .24, steel);
      }
      for (const dx of [-.65, .65]) {
        cylinder(this.group, x + dx, 6.72, 0, .2, 26, steel, 'z', 16);
        for (const fz of [-8, 0, 8]) cylinder(this.group, x + dx, 6.72, fz, .25, .12, orange, 'z', 16);
      }
    }

    // 6. Ground Markings, Lane Lines & Bomb Site A / B Detailing
    const paint = new THREE.MeshStandardMaterial({color: '#d4be7a', roughness: .88, polygonOffset: true, polygonOffsetFactor: -1});
    paint.userData.shared = true;
    const whitePaint = new THREE.MeshStandardMaterial({color: '#cfd6d2', roughness: .88, polygonOffset: true, polygonOffsetFactor: -1});
    whitePaint.userData.shared = true;

    for (const x of [-29, 29, -6, 6]) {
      for (let z = -33; z < 34; z += 5) box(this.group, x, .008, z, .13, .012, 2.2, paint, false);
    }
    // Spawn safety lines
    for (const z of [-25.5, 25.5]) {
      box(this.group, 0, .008, z, 15.6, .012, .16, hazardMat, false);
    }

    for (const [key, p] of Object.entries(MAP.sites)) {
      // Concrete site pad + hazard border + glowing corner beacons
      box(this.group, p.x, -.085, p.z, 7.2, .18, 7.2, concreteRoad, false);
      for (const s of [-1, 1]) {
        box(this.group, p.x, .012, p.z + s * 3.55, 7.3, .02, .22, hazardMat, false);
        box(this.group, p.x + s * 3.55, .012, p.z, .22, .02, 7.1, hazardMat, false);
      }
      for (const sx of [-3.4, 3.4]) {
        for (const sz of [-3.4, 3.4]) {
          cylinder(this.group, p.x + sx, .12, p.z + sz, .12, .24, orange, 'y', 10);
        }
      }
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), sign(`SETOR ${key}`, '#f0ca86', '#26383b', 512, 512));
      s.rotation.x = -Math.PI / 2;
      s.position.set(p.x, .022, p.z);
      this.group.add(s);

      const banner = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.1), sign(`SETOR ${key}`, '#f2deb0', '#203b40', 512, 640));
      banner.position.set(key === 'A' ? -31.42 : 31.42, 3.6, -20);
      banner.rotation.y = key === 'A' ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(banner);
    }

    // 7. Service Doors, Louvred Vents, Bollards, Ribbed Drums & Floodlight Towers
    for (const x of [-11, 11]) {
      for (const z of [-20, 20]) {
        const dz = z + (z < 0 ? 7.54 : -7.54);
        const dir = z < 0 ? 1 : -1;
        // Door frame, recessed steel panel, window & crash handle
        box(this.group, x, 1.4, dz, 1.62, 2.84, .1, darkSteel);
        bevelBox(this.group, x, 1.36, dz + dir * .02, 1.42, 2.72, .08, steel, .015, 1);
        box(this.group, x, 2.0, dz + dir * .05, .55, .45, .04, windowGlass);
        box(this.group, x + .46, 1.25, dz + dir * .07, .08, .26, .06, orange);
        // Louvred vent beside door
        box(this.group, x + 2.1, 2.65, dz, 1.12, .82, .1, darkSteel);
        for (let j = 0; j < 5; j++) {
          box(this.group, x + 2.1, 2.38 + j * .13, dz + dir * .04, 1.0, .05, .12, black);
        }
      }
    }

    for (const x of [-29, 29]) {
      for (const z of [-29, 29]) {
        cylinder(this.group, x, .06, z, .2, .12, darkSteel, 'y', 14);
        cylinder(this.group, x, .65, z, .125, 1.3, orange, 'y', 14);
        cylinder(this.group, x, 1.02, z, .13, .22, black, 'y', 14);
      }
    }

    for (let i = 0; i < 10; i++) {
      const x = i < 5 ? -30 : 30, z = -8 + (i % 5) * 3;
      const bMat = i % 2 ? steel : orange;
      cylinder(this.group, x, .55, z, .4, 1.1, bMat, 'y', 18);
      for (const y of [.06, .38, .72, 1.04]) {
        cylinder(this.group, x, y, z, .418, .045, darkSteel, 'y', 18);
      }
    }

    const floodEmissive = new THREE.MeshStandardMaterial({color: '#fff6de', emissive: '#ffebba', emissiveIntensity: 2.4});
    floodEmissive.userData.shared = true;
    for (const x of [-30, 30]) {
      for (const z of [-31, 31]) {
        cylinder(this.group, x, 5, z, .11, 10, darkSteel, 'y', 12);
        cylinder(this.group, x, .4, z, .24, .8, concrete, 'y', 12);
        box(this.group, x, 9.75, z, 1.8, .18, .65, darkSteel);
        box(this.group, x, 9.64, z, 1.56, .04, .52, floodEmissive, false);
      }
    }

    // 8. Distant Industrial Skyline (outside bounded arena)
    for (let i = 0; i < 18; i++) {
      const x = -68 + i * 8, h = 8 + (Math.sin(i * 7) + 1) * 7;
      bevelBox(this.group, x, h / 2, -53 - (i % 3) * 5, 7, h, 8, i % 2 ? concrete : dark, .08, .25, false);
      if (i % 3 === 0) {
        cylinder(this.group, x, h + 5, -53, .82, 10, dark, 'y', 14);
        cylinder(this.group, x, h + 9, -53, .86, .55, orange, 'y', 14);
      }
    }

    // 9. Instanced surface aggregate & pebbles
    const pebbleGeo = new THREE.DodecahedronGeometry(.055, 0);
    pebbleGeo.userData.shared = true;
    const pebbles = new THREE.InstancedMesh(pebbleGeo, dark, 140);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < 140; i++) {
      matrix.makeTranslation(Math.sin(i * 34.3) * 29, .02, Math.cos(i * 12.13) * 34);
      pebbles.setMatrixAt(i, matrix);
    }
    this.group.add(pebbles);
  }
}
