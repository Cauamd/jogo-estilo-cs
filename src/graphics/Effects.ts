import * as THREE from 'three';
import type {GameEvent} from '../shared/types';

const _from = new THREE.Vector3();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

interface ActiveEffect {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  total: number;
  baseOpacity: number;
  velocity?: THREE.Vector3;
  gravity?: number;
  expand?: number;
}

/**
 * High-performance stylized combat VFX (tracers, impact flash, sparks & dust puffs).
 * Shares geometries to avoid GPU memory churn during firefights.
 */
export class Effects {
  items: ActiveEffect[] = [];

  private tracerGeo = new THREE.CylinderGeometry(.009, .004, 1, 6, 1, true);
  private flashGeo = new THREE.OctahedronGeometry(.045, 1);
  private ringGeo = new THREE.RingGeometry(.025, .052, 16);
  private dustGeo = new THREE.IcosahedronGeometry(.05, 0);
  private sparkGeo = new THREE.BoxGeometry(.012, .012, .085);

  constructor(public scene: THREE.Scene) {
    this.tracerGeo.rotateX(Math.PI / 2);
    for (const g of [this.tracerGeo, this.flashGeo, this.ringGeo, this.dustGeo, this.sparkGeo]) {
      g.userData.shared = true;
    }
  }

  shot(e: GameEvent, local: boolean) {
    if (!e.position || !e.end) return;
    _from.set(e.position.x, e.position.y, e.position.z);
    _end.set(e.end.x, e.end.y, e.end.z);
    _dir.subVectors(_end, _from);
    const dist = _dir.length();
    if (dist < .05) return;
    _dir.divideScalar(dist);

    // 1. Discreet stylized tracer (for all weapons except knife)
    if (e.weapon !== 'edge' && dist > 1.2) {
      const startOffset = local ? .85 : .25;
      const tStart = _from.clone().addScaledVector(_dir, startOffset);
      if (local) tStart.y -= .06;
      const tLen = Math.max(.2, dist - startOffset);
      const tMat = new THREE.MeshBasicMaterial({
        color: '#ffe09e',
        transparent: true,
        opacity: local ? .48 : .65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const tracer = new THREE.Mesh(this.tracerGeo, tMat);
      tracer.position.copy(tStart).addScaledVector(_dir, tLen * .5);
      tracer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir);
      tracer.scale.set(1, 1, tLen);
      this.scene.add(tracer);
      this.items.push({mesh: tracer, mat: tMat, life: .048, total: .048, baseOpacity: tMat.opacity});
    }

    // 2. Impact core flash
    const hitTarget = Boolean(e.target);
    const coreMat = new THREE.MeshBasicMaterial({
      color: hitTarget ? '#6df7e6' : '#ffca78',
      transparent: true,
      opacity: .92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const core = new THREE.Mesh(this.flashGeo, coreMat);
    core.position.copy(_end);
    this.scene.add(core);
    this.items.push({mesh: core, mat: coreMat, life: .14, total: .14, baseOpacity: .92, expand: 2.6});

    // 3. Impact shock ring
    const ringMat = new THREE.MeshBasicMaterial({
      color: hitTarget ? '#58e3d2' : '#ffad54',
      transparent: true,
      opacity: .65,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(this.ringGeo, ringMat);
    ring.position.copy(_end).addScaledVector(_dir, -.02);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _dir);
    this.scene.add(ring);
    this.items.push({mesh: ring, mat: ringMat, life: .16, total: .16, baseOpacity: .65, expand: 5.5});

    // 4. Micro sparks
    for (let i = 0; i < 3; i++) {
      const sMat = new THREE.MeshBasicMaterial({
        color: hitTarget ? '#9cfff3' : '#ffd58c',
        transparent: true,
        opacity: .85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const spark = new THREE.Mesh(this.sparkGeo, sMat);
      spark.position.copy(_end);
      const vel = new THREE.Vector3(
        -_dir.x * 2.2 + (Math.random() - .5) * 3.2,
        Math.abs(_dir.y) * 1.5 + .8 + Math.random() * 1.8,
        -_dir.z * 2.2 + (Math.random() - .5) * 3.2
      );
      spark.quaternion.setFromUnitVectors(_up, vel.clone().normalize());
      this.scene.add(spark);
      this.items.push({mesh: spark, mat: sMat, life: .18, total: .18, baseOpacity: .85, velocity: vel, gravity: 9.5});
    }

    // 5. Subtle dust puffs (world impacts)
    if (!hitTarget) {
      for (let i = 0; i < 3; i++) {
        const dMat = new THREE.MeshBasicMaterial({
          color: '#c4c2b8',
          transparent: true,
          opacity: .32,
          depthWrite: false,
        });
        const smoke = new THREE.Mesh(this.dustGeo, dMat);
        smoke.position.copy(_end);
        const vel = new THREE.Vector3(
          Math.sin(i * 2.1) * .35 - _dir.x * .25,
          .35 + Math.random() * .3,
          Math.cos(i * 2.1) * .35 - _dir.z * .25
        );
        this.scene.add(smoke);
        this.items.push({mesh: smoke, mat: dMat, life: .52, total: .52, baseOpacity: .32, velocity: vel, expand: 2.2});
      }
    }

    while (this.items.length > 110) this.remove(0);
  }

  update(dt: number) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.remove(i);
        continue;
      }
      const ratio = p.life / p.total;
      p.mat.opacity = p.baseOpacity * ratio;
      if (p.velocity) {
        if (p.gravity) p.velocity.y -= p.gravity * dt;
        p.mesh.position.addScaledVector(p.velocity, dt);
      }
      if (p.expand) {
        p.mesh.scale.multiplyScalar(1 + dt * p.expand);
      }
    }
  }

  remove(i: number) {
    const p = this.items[i];
    this.scene.remove(p.mesh);
    p.mat.dispose();
    this.items.splice(i, 1);
  }
}
