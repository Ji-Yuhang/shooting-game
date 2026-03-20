import RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import { COVER_NODES, ENEMY_SPAWNS, OBSTACLES, PLAYER_SPAWN } from "../data/arena";
import { GAME_CONFIG } from "./config";
import {
  computeArrowSpeed,
  computeChargeRatio,
  integrateProjectile
} from "./logic";
import type {
  ActorState,
  CombatState,
  CoverNode,
  EnemyRole,
  ObstacleSpec,
  SmokeCloudState
} from "./types";
import {
  getForwardFromYaw,
  resolveCircleObstacleCollisions,
  smoothLookAtDirection
} from "./utils/math";
import { CameraRig } from "./systems/CameraRig";
import { CombatSystem } from "./systems/CombatSystem";
import { InputController } from "./systems/InputController";
import { ProjectileSystem } from "./systems/ProjectileSystem";
import { AISystem, type EnemyAgent } from "./systems/AISystem";
import { HudController } from "../ui/HudController";

type GameOverlay = "intro" | "paused" | "victory" | "defeat" | null;

type CharacterVisual = {
  group: THREE.Group;
  body: THREE.Mesh;
  torso: THREE.Mesh;
  pelvis: THREE.Mesh;
  head: THREE.Mesh;
  bow: THREE.Mesh;
  leftArm: THREE.Mesh;
  rightArm: THREE.Mesh;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  chestPlate: THREE.Mesh;
  quiver: THREE.Mesh;
  quiverFeathers: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
};

type DeathCrate = {
  enemyId: string;
  position: THREE.Vector3;
  mesh: THREE.Mesh;
};

type SmokeCloudVisual = {
  state: SmokeCloudState;
  group: THREE.Group;
  puffs: THREE.Mesh[];
};

class ShootingGame {
  private readonly scene = new THREE.Scene();
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly input: InputController;
  private readonly cameraRig: CameraRig;
  private readonly combatSystem = new CombatSystem();
  private readonly aiSystem = new AISystem();
  private readonly hud = new HudController();
  private readonly playerVisual: CharacterVisual;
  private readonly enemyVisuals: CharacterVisual[] = [];
  private readonly projectileSystem: ProjectileSystem;
  private readonly trajectoryLine: THREE.Line;
  private readonly trajectoryMaterial: THREE.LineBasicMaterial;
  private readonly trajectoryPositions = new Float32Array(3 * 32);
  private readonly trajectoryImpactMarker: THREE.Mesh;
  private readonly deathCrates: DeathCrate[] = [];
  private readonly smokeClouds: SmokeCloudVisual[] = [];
  private readonly world = new RAPIER.World({ x: 0, y: -GAME_CONFIG.combat.gravity, z: 0 });
  private readonly player: ActorState;
  private readonly playerCombat: CombatState = {
    mode: "idle",
    chargeSeconds: 0,
    cooldownRemaining: 0,
    blockedShotUntil: 0
  };
  private readonly enemies: EnemyAgent[] = [];
  private readonly coverNodes: CoverNode[] = COVER_NODES.map((node) => ({
    ...node,
    position: node.position.clone(),
    facing: node.facing.clone(),
    occupiedBy: null
  }));
  private readonly obstacles: ObstacleSpec[] = OBSTACLES.map((obstacle) => ({
    ...obstacle,
    position: obstacle.position.clone(),
    size: obstacle.size.clone()
  }));
  private lastTime = 0;
  private accumulator = 0;
  private overlay: GameOverlay = "intro";
  private loopHandle = 0;
  private hudMessage = "";
  private hudMessageUntil = 0;
  private playerSmokeCooldownRemaining = 0;
  private readonly bowTexture = this.createBowTexture();

  constructor(private readonly root: HTMLElement) {
    this.root.className = "game-root";
    this.renderer.domElement.className = "game-canvas";
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.root.append(this.renderer.domElement);

    this.input = new InputController(this.renderer.domElement);
    this.cameraRig = new CameraRig(1);
    this.projectileSystem = new ProjectileSystem(this.scene);
    this.player = this.createActor("player", "player", GAME_CONFIG.player.health);
    this.trajectoryMaterial = new THREE.LineBasicMaterial({
      color: "#f0d184",
      transparent: true,
      opacity: 0.9
    });
    this.trajectoryLine = new THREE.Line(
      new THREE.BufferGeometry(),
      this.trajectoryMaterial
    );
    this.trajectoryLine.geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.trajectoryPositions, 3)
    );
    this.trajectoryLine.geometry.setDrawRange(0, 0);
    this.trajectoryLine.visible = false;
    this.scene.add(this.trajectoryLine);
    this.trajectoryImpactMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({
        color: "#ffd48b",
        transparent: true,
        opacity: 0.95
      })
    );
    this.trajectoryImpactMarker.visible = false;
    this.scene.add(this.trajectoryImpactMarker);

    this.playerVisual = this.createCharacterVisual("#7fb6b4", "#8fc6bf");
    this.scene.add(this.playerVisual.group);

    this.buildScene();
    this.spawnActors();
    this.hud.attach(this.root);

    this.root.addEventListener("click", this.handleRootClick);
    window.addEventListener("resize", this.handleResize);
    this.handleResize();
  }

  start(): void {
    this.loopHandle = requestAnimationFrame(this.frame);
  }

  dispose(): void {
    cancelAnimationFrame(this.loopHandle);
    this.input.dispose();
    this.root.removeEventListener("click", this.handleRootClick);
    window.removeEventListener("resize", this.handleResize);
  }

  private buildScene(): void {
    this.scene.background = new THREE.Color("#15302d");
    this.scene.fog = new THREE.Fog("#15302d", 30, 78);

    const hemi = new THREE.HemisphereLight("#eff8ee", "#315648", 1.55);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight("#d8efe4", 0.42);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight("#fff2cb", 1.95);
    sun.position.set(15, 30, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -28;
    sun.shadow.camera.right = 28;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.BoxGeometry(GAME_CONFIG.arenaSize, 1, GAME_CONFIG.arenaSize),
      new THREE.MeshStandardMaterial({
        color: "#4e6c5a",
        roughness: 0.92,
        metalness: 0.02
      })
    );
    ground.position.set(0, -0.5, 0);
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        GAME_CONFIG.arenaSize * 0.5,
        0.5,
        GAME_CONFIG.arenaSize * 0.5
      ).setTranslation(0, -0.5, 0)
    );

    const boundary = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(GAME_CONFIG.arenaSize, 0.2, GAME_CONFIG.arenaSize)
      ),
      new THREE.LineBasicMaterial({ color: "#7ea392" })
    );
    boundary.position.y = 0.08;
    this.scene.add(boundary);

    for (const obstacle of this.obstacles) {
      const mesh = this.createObstacleMesh(obstacle);
      this.scene.add(mesh);
      this.createObstacleCollider(obstacle);
    }
  }

  private spawnActors(): void {
    const roles: EnemyRole[] = ["suppressor", "flanker", "harasser", "rescuer"];
    this.player.position.copy(PLAYER_SPAWN);
    this.player.forward.set(0, 0, -1);
    this.player.desiredForward.copy(this.player.forward);

    for (const [index, spawn] of ENEMY_SPAWNS.entries()) {
      const actor = this.createActor(`enemy-${index}`, "enemy", GAME_CONFIG.ai.health);
      actor.position.copy(spawn);
      actor.forward.copy(getForwardFromYaw(index === 0 ? -2.35 : 2.6));
      actor.desiredForward.copy(actor.forward);
      const visual = this.createCharacterVisual("#d97a68", "#de9676");
      this.enemyVisuals.push(visual);
      this.scene.add(visual.group);

      this.enemies.push({
        actor,
        combat: {
          mode: "idle",
          chargeSeconds: 0,
          cooldownRemaining: 0,
          blockedShotUntil: 0
        },
        state: "Patrol",
        role: roles[index % roles.length],
        patrolIndex: index * 2,
        stateTimer: 0,
        attackCooldownRemaining: 1.2 + index * 0.6,
        smokeCooldownRemaining: index * 0.8,
        perception: {
          canSeeTarget: false,
          exposure: 0,
          distanceToTarget: 0,
          lastKnownTarget: null
        },
        targetCoverId: null,
        assignedAllyId: null,
        tacticTarget: null,
        crawlTarget: null,
        mesh: visual.group,
        materials: visual.materials
      });
    }
  }

  private createActor(id: string, kind: "player" | "enemy", maxHealth: number): ActorState {
    return {
      id,
      kind,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      forward: new THREE.Vector3(0, 0, 1),
      desiredForward: new THREE.Vector3(0, 0, 1),
      isCrouching: false,
      peekDirection: 0,
      health: maxHealth,
      maxHealth,
      lifeState: "alive",
      downedHealth: 0,
      stationaryTime: 0,
      reviveProgress: 0,
      bleedoutTimer: 0,
      combatMode: "idle",
      hitFlash: 0,
      isAlive: true
    };
  }

  private createCharacterVisual(baseColor: string, emissiveColor: string): CharacterVisual {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: emissiveColor,
      emissiveIntensity: 0.12,
      roughness: 0.65,
      metalness: 0.08
    });
    const torsoMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(baseColor).offsetHSL(0.02, -0.08, -0.08),
      emissive: emissiveColor,
      emissiveIntensity: 0.08,
      roughness: 0.58
    });
    const pantsMaterial = new THREE.MeshStandardMaterial({
      color: "#4b5f78",
      emissive: "#263244",
      emissiveIntensity: 0.06,
      roughness: 0.7
    });
    const headMaterial = bodyMaterial.clone();
    const armMaterial = new THREE.MeshStandardMaterial({
      color: "#d8be9b",
      emissive: "#5f4d35",
      emissiveIntensity: 0.06,
      roughness: 0.72
    });
    const bowMaterial = new THREE.MeshStandardMaterial({
      color: "#e2c892",
      emissive: "#8b6934",
      emissiveIntensity: 0.16,
      roughness: 0.42,
      metalness: 0.08,
      map: this.bowTexture
    });
    const frontMaterial = new THREE.MeshStandardMaterial({
      color: "#d5f3ee",
      emissive: "#89d7cf",
      emissiveIntensity: 0.32,
      roughness: 0.35
    });
    const quiverMaterial = new THREE.MeshStandardMaterial({
      color: "#5a3e2e",
      emissive: "#40261b",
      emissiveIntensity: 0.12,
      roughness: 0.7
    });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 8), bodyMaterial);
    body.castShadow = true;
    body.position.y = 0.9;

    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.64, 0.34),
      torsoMaterial
    );
    torso.castShadow = true;
    torso.position.set(0, 1.06, 0);

    const pelvis = new THREE.Mesh(
      new THREE.BoxGeometry(0.52, 0.3, 0.28),
      pantsMaterial
    );
    pelvis.castShadow = true;
    pelvis.position.set(0, 0.62, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), headMaterial);
    head.castShadow = true;
    head.position.y = 1.72;

    const leftArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.46, 4, 8),
      armMaterial
    );
    leftArm.castShadow = true;
    leftArm.position.set(0.42, 1.28, 0.12);
    leftArm.rotation.z = -0.65;

    const rightArm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.42, 4, 8),
      armMaterial
    );
    rightArm.castShadow = true;
    rightArm.position.set(-0.38, 1.2, 0.04);
    rightArm.rotation.z = 0.78;
    rightArm.rotation.y = 0.18;

    const leftLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.54, 4, 8),
      pantsMaterial
    );
    leftLeg.castShadow = true;
    leftLeg.position.set(0.16, 0.22, 0);

    const rightLeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.09, 0.54, 4, 8),
      pantsMaterial
    );
    rightLeg.castShadow = true;
    rightLeg.position.set(-0.16, 0.22, 0);

    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 8, 20, Math.PI), bowMaterial);
    bow.castShadow = true;
    bow.position.set(0.54, 1.18, 0.18);
    bow.rotation.set(Math.PI / 2, 0, Math.PI / 2);

    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.24, 0.1),
      frontMaterial
    );
    chestPlate.castShadow = true;
    chestPlate.position.set(0, 1.2, 0.28);

    const quiver = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.54, 0.16),
      quiverMaterial
    );
    quiver.castShadow = true;
    quiver.position.set(-0.14, 1.28, -0.28);
    quiver.rotation.x = -0.4;
    quiver.rotation.z = 0.15;

    const quiverFeathers = new THREE.Group();
    for (const [index, offset] of [-0.04, 0, 0.04].entries()) {
      const feather = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, 0.16, 6),
        new THREE.MeshStandardMaterial({
          color: index === 1 ? "#f7f2df" : "#ffb6a0",
          emissive: index === 1 ? "#a48f65" : "#925447",
          emissiveIntensity: 0.14,
          roughness: 0.45
        })
      );
      feather.castShadow = true;
      feather.position.set(offset, 1.6, -0.36 - index * 0.01);
      feather.rotation.x = Math.PI;
      quiverFeathers.add(feather);
    }

    const group = new THREE.Group();
    group.add(
      body,
      torso,
      pelvis,
      head,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      bow,
      chestPlate,
      quiver,
      quiverFeathers
    );

    return {
      group,
      body,
      torso,
      pelvis,
      head,
      bow,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      chestPlate,
      quiver,
      quiverFeathers,
      materials: [
        bodyMaterial,
        torsoMaterial,
        pantsMaterial,
        headMaterial,
        armMaterial,
        bowMaterial,
        frontMaterial,
        quiverMaterial
      ]
    };
  }

  private createObstacleMesh(obstacle: ObstacleSpec): THREE.Object3D {
    const material = new THREE.MeshStandardMaterial({
      color: obstacle.color,
      roughness: 0.88,
      metalness: 0.05
    });

    if (obstacle.shape === "box") {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(obstacle.size.x, obstacle.size.y, obstacle.size.z),
        material
      );
      mesh.position.copy(obstacle.position);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    if (obstacle.shape === "sphere") {
      const mesh = new THREE.Mesh(
        new THREE.IcosahedronGeometry(obstacle.size.x, 2),
        material
      );
      mesh.position.copy(obstacle.position);
      mesh.scale.set(1, obstacle.size.y / obstacle.size.x, obstacle.size.z / obstacle.size.x);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }

    const group = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(obstacle.size.x, obstacle.size.x * 1.1, obstacle.size.y, 10),
      material
    );
    trunk.position.copy(obstacle.position);
    trunk.castShadow = true;
    group.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(obstacle.size.x * 1.8, 12, 12),
      new THREE.MeshStandardMaterial({
        color: "#4b6d45",
        roughness: 0.92
      })
    );
    crown.position.copy(obstacle.position).add(new THREE.Vector3(0, obstacle.size.y * 0.65, 0));
    crown.castShadow = true;
    group.add(crown);
    return group;
  }

  private createObstacleCollider(obstacle: ObstacleSpec): void {
    if (obstacle.shape === "box") {
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(
          obstacle.size.x * 0.5,
          obstacle.size.y * 0.5,
          obstacle.size.z * 0.5
        ).setTranslation(obstacle.position.x, obstacle.position.y, obstacle.position.z)
      );
      return;
    }

    if (obstacle.shape === "sphere") {
      this.world.createCollider(
        RAPIER.ColliderDesc.ball(obstacle.size.x).setTranslation(
          obstacle.position.x,
          obstacle.position.y,
          obstacle.position.z
        )
      );
      return;
    }

    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(obstacle.size.y * 0.5, obstacle.size.x).setTranslation(
        obstacle.position.x,
        obstacle.position.y,
        obstacle.position.z
      )
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(obstacle.size.x * 1.3).setTranslation(
        obstacle.position.x,
        obstacle.position.y + obstacle.size.y * 0.65,
        obstacle.position.z
      )
    );
  }

  private handleRootClick = (): void => {
    if (this.overlay === "victory" || this.overlay === "defeat") {
      return;
    }
    this.input.requestPointerLock();
    this.overlay = null;
  };

  private handleResize = (): void => {
    const { clientWidth, clientHeight } = this.root;
    this.renderer.setSize(clientWidth, clientHeight, false);
    this.cameraRig.resize(clientWidth / Math.max(1, clientHeight));
  };

  private frame = (time: number): void => {
    const deltaSeconds = this.lastTime === 0 ? 0 : Math.min(0.05, (time - this.lastTime) / 1000);
    this.lastTime = time;

    const input = this.input.captureFrame();
    if ((this.overlay === null || this.overlay === "paused") && !input.pointerLocked) {
      this.overlay = this.overlay === null ? "paused" : this.overlay;
    }
    if (input.pausePressed) {
      if (this.overlay === null) {
        this.input.exitPointerLock();
        this.overlay = "paused";
      } else if (this.overlay === "paused") {
        this.overlay = null;
        this.input.requestPointerLock();
      }
    }
    if (input.restartPressed) {
      this.resetRound();
    }

    if (this.overlay === null) {
      this.accumulator += deltaSeconds;
      let subSteps = 0;
      while (
        this.accumulator >= GAME_CONFIG.fixedTimeStep &&
        subSteps < GAME_CONFIG.maxSubSteps
      ) {
        this.updateFixed(GAME_CONFIG.fixedTimeStep, input, time / 1000);
        this.accumulator -= GAME_CONFIG.fixedTimeStep;
        subSteps += 1;
      }
    }

    this.cameraRig.applyLookDelta(input.lookDelta);
    this.cameraRig.update(
      this.player,
      this.playerCombat.mode === "aiming" || this.playerCombat.mode === "charging",
      this.player.peekDirection,
      this.world
    );

    this.updateTrajectoryPreview();
    this.syncVisuals(deltaSeconds);
    this.renderHud(time / 1000);
    this.renderer.render(this.scene, this.cameraRig.camera);
    this.loopHandle = requestAnimationFrame(this.frame);
  };

  private updateFixed(deltaSeconds: number, input: ReturnType<InputController["captureFrame"]>, timeSeconds: number): void {
    this.updatePlayer(deltaSeconds, input, timeSeconds);
    this.combatSystem.updatePlayer(deltaSeconds, {
      player: this.player,
      state: this.playerCombat,
      input,
      world: this.world,
      cameraRig: this.cameraRig,
      projectileSystem: this.projectileSystem,
      timeSeconds,
      showMessage: (text) => this.pushHudMessage(text, timeSeconds)
    });
    this.player.combatMode = this.playerCombat.mode;
    this.tryDeployPlayerSmoke(input, timeSeconds);

    this.aiSystem.update({
      deltaSeconds,
      world: this.world,
      player: this.player,
      enemies: this.enemies,
      obstacles: this.obstacles,
      arenaHalfSize: GAME_CONFIG.arenaSize * 0.5,
      coverNodes: this.coverNodes,
      projectileSystem: this.projectileSystem,
      combatSystem: this.combatSystem,
      smokes: this.smokeClouds.map((cloud) => cloud.state),
      deploySmoke: (throwerId, target, reason) => this.deploySmoke(throwerId, target, reason)
    });

    this.projectileSystem.update(deltaSeconds, {
      world: this.world,
      player: this.player,
      enemies: this.enemies.map((enemy) => enemy.actor),
      onActorDamaged: (actorId, damage) => this.applyDamage(actorId, damage, timeSeconds)
    });

    this.updateActorRecovery(deltaSeconds);
    this.updateSmokeClouds(deltaSeconds);
    this.finalizeEnemyDeaths(timeSeconds);

    if (this.player.health <= 0 && this.overlay === null) {
      this.overlay = "defeat";
      this.input.exitPointerLock();
    }

    const remainingEnemies = this.enemies.filter(
      (enemy) => enemy.actor.lifeState !== "dead"
    ).length;
    if (remainingEnemies === 0 && this.overlay === null) {
      this.overlay = "victory";
      this.input.exitPointerLock();
    }
  }

  private updatePlayer(
    deltaSeconds: number,
    input: ReturnType<InputController["captureFrame"]>,
    timeSeconds: number
  ): void {
    if (!this.player.isAlive) {
      return;
    }

    if (input.crouchPressed) {
      this.player.isCrouching = !this.player.isCrouching;
      this.pushHudMessage(this.player.isCrouching ? "切换为蹲下" : "切换为站立", timeSeconds);
    }

    const isAiming =
      this.playerCombat.mode === "aiming" || this.playerCombat.mode === "charging";
    const isCharging = this.playerCombat.mode === "charging";
    const freeLookHeld = input.freeLookHeld && !isAiming;
    const cameraForward = this.cameraRig.getFlatForward();
    const movementForward = freeLookHeld
      ? this.player.forward.clone()
      : cameraForward.clone();
    const movementRight = new THREE.Vector3(-movementForward.z, 0, movementForward.x);
    const canPeek =
      !this.player.isCrouching &&
      !isCharging &&
      !freeLookHeld &&
      input.movement.lengthSq() < 0.15;
    this.player.peekDirection = canPeek ? input.peekDirection : 0;

    const speed = this.player.isCrouching
      ? GAME_CONFIG.player.crouchMoveSpeed
      : isAiming
        ? GAME_CONFIG.player.aimMoveSpeed
        : GAME_CONFIG.player.moveSpeed;

    const moveDirection = movementForward
      .clone()
      .multiplyScalar(input.movement.y)
      .add(movementRight.clone().multiplyScalar(input.movement.x));
    if (moveDirection.lengthSq() > 1) {
      moveDirection.normalize();
    }

    if (this.player.peekDirection !== 0 && moveDirection.lengthSq() > 0.08) {
      this.player.peekDirection = 0;
    }

    this.player.velocity.copy(moveDirection.multiplyScalar(speed));
    this.player.position.addScaledVector(this.player.velocity, deltaSeconds);
    resolveCircleObstacleCollisions(
      this.player.position,
      GAME_CONFIG.player.radius,
      this.obstacles,
      GAME_CONFIG.arenaSize * 0.5
    );

    if (this.player.velocity.lengthSq() > 0.03) {
      this.player.velocity.normalize().multiplyScalar(speed);
    }

    if (!freeLookHeld) {
      this.player.desiredForward.copy(cameraForward);
    } else if (this.player.velocity.lengthSq() > 0.03) {
      this.player.desiredForward.copy(this.player.forward);
    }

    smoothLookAtDirection(
      this.player.forward,
      this.player.desiredForward,
      GAME_CONFIG.player.turnSpeed,
      deltaSeconds
    );
  }

  private updateTrajectoryPreview(): void {
    const isAiming =
      this.playerCombat.mode === "aiming" || this.playerCombat.mode === "charging";
    if (!isAiming || this.overlay !== null || !this.player.isAlive) {
      this.trajectoryLine.visible = false;
      this.trajectoryImpactMarker.visible = false;
      return;
    }

    const origin = this.cameraRig.getShotOrigin(this.player);
    const target = this.cameraRig.getAimTarget(this.world);
    const shotDistance = origin.distanceTo(target);
    const previewRatio = this.combatSystem.getPreviewChargeRatio(
      this.playerCombat.chargeSeconds,
      shotDistance
    );
    const speed = computeArrowSpeed(
      previewRatio,
      GAME_CONFIG.combat.minArrowSpeed,
      GAME_CONFIG.combat.maxArrowSpeed
    );
    const gravityScale = this.combatSystem.getGravityScale(shotDistance, previewRatio);
    const velocity = target.clone().sub(origin).normalize().multiplyScalar(speed);

    let currentPosition = origin.clone();
    let currentVelocity = velocity.clone();
    let pointCount = 0;
    this.trajectoryImpactMarker.visible = false;

    this.writeTrajectoryPoint(pointCount, currentPosition);
    pointCount += 1;

    const segmentStep = 0.08;
    for (let index = 0; index < 30; index += 1) {
      const next = integrateProjectile(
        currentPosition,
        currentVelocity,
        GAME_CONFIG.combat.gravity * gravityScale,
        segmentStep
      );
      const segment = next.position.clone().sub(currentPosition);
      const segmentDistance = segment.length();

      if (segmentDistance <= 0.0001) {
        break;
      }

      const direction = segment.normalize();
      const hit = this.world.castRay(
        new RAPIER.Ray(
          { x: currentPosition.x, y: currentPosition.y, z: currentPosition.z },
          { x: direction.x, y: direction.y, z: direction.z }
        ),
        segmentDistance,
        true
      );

      if (hit) {
        const impact = currentPosition
          .clone()
          .add(direction.multiplyScalar(hit.timeOfImpact));
        this.writeTrajectoryPoint(pointCount, impact);
        pointCount += 1;
        this.trajectoryImpactMarker.position.copy(impact);
        this.trajectoryImpactMarker.visible = true;
        break;
      }

      this.writeTrajectoryPoint(pointCount, next.position);
      pointCount += 1;
      currentPosition = next.position;
      currentVelocity = next.velocity;

      if (currentPosition.y <= 0.15) {
        this.trajectoryImpactMarker.position.copy(currentPosition);
        this.trajectoryImpactMarker.visible = true;
        break;
      }
    }

    if (pointCount < 2) {
      this.trajectoryLine.visible = false;
      this.trajectoryImpactMarker.visible = false;
      return;
    }

    this.trajectoryMaterial.color.set(
      this.playerCombat.mode === "charging" ? "#ffd995" : "#b7d7c0"
    );
    this.trajectoryMaterial.opacity =
      this.playerCombat.mode === "charging" ? 0.95 : 0.55;
    this.trajectoryLine.geometry.setDrawRange(0, pointCount);
    (
      this.trajectoryLine.geometry.getAttribute("position") as THREE.BufferAttribute
    ).needsUpdate = true;
    this.trajectoryLine.visible = true;
  }

  private writeTrajectoryPoint(index: number, point: THREE.Vector3): void {
    const offset = index * 3;
    this.trajectoryPositions[offset] = point.x;
    this.trajectoryPositions[offset + 1] = point.y;
    this.trajectoryPositions[offset + 2] = point.z;
  }

  private applyDamage(actorId: string, damage: number, timeSeconds: number): void {
    if (this.player.id === actorId) {
      this.player.health = Math.max(0, this.player.health - damage);
      this.player.hitFlash = 0.35;
      this.player.stationaryTime = 0;
      if (this.player.health <= 0) {
        this.player.isAlive = false;
        this.player.lifeState = "dead";
        this.player.combatMode = "dead";
      }
      this.pushHudMessage("玩家受到箭伤", timeSeconds);
      return;
    }

    const enemy = this.enemies.find((entry) => entry.actor.id === actorId);
    if (!enemy) {
      return;
    }

    enemy.actor.hitFlash = 0.35;
    enemy.actor.stationaryTime = 0;

    if (enemy.actor.lifeState === "downed") {
      enemy.actor.downedHealth = Math.max(0, enemy.actor.downedHealth - damage);
      enemy.stateTimer = 0;
      if (enemy.actor.downedHealth <= 0) {
        this.killEnemy(enemy, timeSeconds, "敌人被彻底击杀");
      } else {
        this.pushHudMessage("继续压制倒地敌人", timeSeconds);
      }
      return;
    }

    enemy.actor.health = Math.max(0, enemy.actor.health - damage);
    enemy.state = enemy.actor.health <= 0 ? "Downed" : "Hit";
    enemy.stateTimer = 0;
    if (enemy.actor.health <= 0) {
      enemy.actor.lifeState = "downed";
      enemy.actor.health = 0;
      enemy.actor.downedHealth = GAME_CONFIG.ai.downedHealth;
      enemy.actor.reviveProgress = 0;
      enemy.actor.bleedoutTimer = 0;
      enemy.actor.isCrouching = true;
      enemy.actor.velocity.set(0, 0, 0);
      enemy.actor.combatMode = "idle";
      this.pushHudMessage("敌人被击倒", timeSeconds);
    } else {
      this.pushHudMessage("命中敌人", timeSeconds);
    }
  }

  private syncVisuals(deltaSeconds: number): void {
    this.updateCharacterVisual(this.player, this.playerVisual, deltaSeconds);
    this.enemies.forEach((enemy, index) => {
      this.updateCharacterVisual(enemy.actor, this.enemyVisuals[index], deltaSeconds);
      const emissive = enemy.actor.hitFlash > 0 ? 0.6 : 0.08;
      enemy.materials.forEach((material) => {
        material.emissiveIntensity = emissive;
      });
    });
    this.playerVisual.materials.forEach((material) => {
      material.emissiveIntensity = this.player.hitFlash > 0 ? 0.65 : 0.08;
    });
    this.player.hitFlash = Math.max(0, this.player.hitFlash - deltaSeconds);
    this.enemies.forEach((enemy) => {
      enemy.actor.hitFlash = Math.max(0, enemy.actor.hitFlash - deltaSeconds);
    });
  }

  private updateCharacterVisual(
    actor: ActorState,
    visual: CharacterVisual,
    deltaSeconds: number
  ): void {
    visual.group.visible = actor.lifeState !== "dead";
    visual.group.position.copy(actor.position);
    visual.group.rotation.y = Math.atan2(actor.forward.x, actor.forward.z);

    if (actor.lifeState === "downed") {
      visual.body.scale.y = 0.48;
      visual.body.position.set(0, 0.22, 0.02);
      visual.body.rotation.z = Math.PI / 2 - 0.08;
      visual.torso.position.set(0.04, 0.24, 0.05);
      visual.torso.rotation.z = Math.PI / 2 - 0.12;
      visual.pelvis.position.set(-0.16, 0.18, 0);
      visual.pelvis.rotation.z = Math.PI / 2 - 0.18;
      visual.head.position.set(0.4, 0.2, 0.06);
      visual.leftArm.position.set(0.12, 0.24, 0.3);
      visual.leftArm.rotation.z = -1.4;
      visual.rightArm.position.set(-0.18, 0.18, -0.04);
      visual.rightArm.rotation.z = 1.45;
      visual.leftLeg.position.set(-0.32, 0.16, 0.08);
      visual.leftLeg.rotation.z = 1.28;
      visual.rightLeg.position.set(-0.48, 0.14, -0.04);
      visual.rightLeg.rotation.z = 1.52;
      visual.bow.position.set(0.54, 0.16, 0.2);
      visual.bow.rotation.set(0.18, 0, Math.PI / 2);
      visual.chestPlate.position.set(0.08, 0.38, 0.1);
      visual.quiver.position.set(-0.18, 0.28, -0.22);
      visual.quiver.rotation.x = 0.25;
      visual.quiverFeathers.position.y = -1.02;
      (visual.chestPlate.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9;
      return;
    }

    visual.body.rotation.z = 0;
    visual.torso.rotation.z = 0;
    visual.pelvis.rotation.z = 0;
    visual.leftArm.rotation.z = -0.65;
    visual.rightArm.rotation.z = 0.78;
    visual.rightArm.rotation.y = 0.18;
    visual.leftLeg.rotation.z = 0;
    visual.rightLeg.rotation.z = 0;
    visual.bow.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    visual.quiver.rotation.x = -0.4;
    visual.quiver.rotation.z = 0.15;
    (visual.chestPlate.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.32;

    const combatRaise =
      actor.combatMode === "charging" ? 1 : actor.combatMode === "cooldown" ? 0.55 : 0;
    const attackOffsetX = actor.peekDirection * 0.08;
    const attackOffsetY = combatRaise * 0.18;
    const bowPullX = combatRaise * 0.12;

    const crouchBlend = actor.isCrouching ? 0.78 : 1;
    visual.body.scale.y = crouchBlend;
    visual.body.position.y = actor.isCrouching ? 0.68 : 0.9;
    visual.torso.position.set(0, actor.isCrouching ? 0.86 : 1.06, 0);
    visual.pelvis.position.set(0, actor.isCrouching ? 0.46 : 0.62, 0);
    visual.head.position.set(0, actor.isCrouching ? 1.28 : 1.72, 0);
    visual.leftArm.position.set(
      0.46 + actor.peekDirection * 0.12 + attackOffsetX,
      (actor.isCrouching ? 1.03 : 1.28) + attackOffsetY,
      0.16 + combatRaise * 0.08
    );
    visual.rightArm.position.set(
      -0.38 + actor.peekDirection * 0.06 - bowPullX,
      (actor.isCrouching ? 0.98 : 1.2) + attackOffsetY * 0.8,
      0.06 - combatRaise * 0.04
    );
    visual.leftArm.rotation.z = -0.65 - combatRaise * 0.55;
    visual.rightArm.rotation.z = 0.78 + combatRaise * 0.4;
    visual.rightArm.rotation.y = 0.18 + combatRaise * 0.15;
    visual.leftLeg.position.set(0.16, actor.isCrouching ? 0.14 : 0.22, 0);
    visual.rightLeg.position.set(-0.16, actor.isCrouching ? 0.14 : 0.22, 0);
    visual.bow.position.set(
      0.54 + actor.peekDirection * 0.18 + attackOffsetX,
      (actor.isCrouching ? 0.98 : 1.18) + attackOffsetY,
      0.18 + combatRaise * 0.08
    );
    visual.bow.rotation.set(
      Math.PI / 2 - combatRaise * 0.08,
      combatRaise * 0.1,
      Math.PI / 2 + combatRaise * 0.08
    );
    visual.chestPlate.position.set(0, actor.isCrouching ? 0.98 : 1.2, 0.28);
    visual.quiver.position.set(-0.14, actor.isCrouching ? 1.08 : 1.28, -0.28);
    visual.quiverFeathers.position.y = actor.isCrouching ? -0.18 : 0;
    visual.group.position.y = 0;
  }

  private renderHud(timeSeconds: number): void {
    if (this.hudMessageUntil <= timeSeconds) {
      this.hudMessage = "";
    }

    const remainingEnemies = this.enemies.filter(
      (enemy) => enemy.actor.lifeState !== "dead"
    ).length;
    const overlayMap: Record<Exclude<GameOverlay, null>, { title: string; body: string }> = {
      intro: {
        title: "射箭对抗 MVP",
        body: "点击画面锁定鼠标并开始。利用掩体、蹲下和探头击败 4 名敌人。"
      },
      paused: {
        title: "已暂停",
        body: "点击画面继续，或按 Esc 切换暂停。"
      },
      victory: {
        title: "胜利",
        body: "所有敌人已被击败。按 R 重新开始。"
      },
      defeat: {
        title: "失败",
        body: "玩家生命归零。按 R 重新开始。"
      }
    };

    const overlay = this.overlay ? overlayMap[this.overlay] : null;
    const tags = [];
    if (this.player.isCrouching) {
      tags.push("蹲下");
    }
    if (this.player.peekDirection === -1) {
      tags.push("左探头");
    }
    if (this.player.peekDirection === 1) {
      tags.push("右探头");
    }
    if (this.playerCombat.mode === "aiming" || this.playerCombat.mode === "charging") {
      tags.push("瞄准");
    }
    if (this.playerCombat.mode === "charging") {
      tags.push("蓄力");
    }

    const chargeRatio = this.getCurrentChargeRatio();
    const chargePercent = Math.round(chargeRatio * 100);

    this.hud.render({
      playerHealth: this.player.health,
      enemyCount: remainingEnemies,
      totalEnemies: this.enemies.length,
      chargeRatio,
      chargePercent,
      chargeLabel: this.getChargeLabel(chargeRatio),
      chargeHint: this.getChargeHint(chargeRatio),
      crosshairVisible:
        this.playerCombat.mode === "aiming" || this.playerCombat.mode === "charging",
      tags,
      message: this.hudMessage,
      overlayTitle: overlay?.title ?? null,
      overlayBody: overlay?.body ?? "",
      minimapPlayer: this.getMinimapPoint(this.player.position, this.player.forward),
      minimapEnemies: this.enemies
        .filter((enemy) => enemy.actor.lifeState !== "dead")
        .map((enemy) => this.getMinimapPoint(enemy.actor.position))
      ,
      minimapDeaths: this.deathCrates.map((crate) => this.getMinimapPoint(crate.position)),
      smokeOpacity: this.getSmokeObscureAlpha()
    });
  }

  private pushHudMessage(text: string, timeSeconds: number): void {
    this.hudMessage = text;
    this.hudMessageUntil = timeSeconds + 1.2;
  }

  private getCurrentChargeRatio(): number {
    const origin = this.cameraRig.getShotOrigin(this.player);
    const target = this.cameraRig.getAimTarget(this.world);
    return this.combatSystem.getPreviewChargeRatio(
      this.playerCombat.chargeSeconds,
      origin.distanceTo(target)
    );
  }

  private getChargeLabel(chargeRatio: number): string {
    if (this.playerCombat.mode !== "charging") {
      return "待命";
    }
    if (chargeRatio < 0.22) {
      return "弱拉弓";
    }
    if (chargeRatio < 0.6) {
      return "半蓄力";
    }
    if (chargeRatio < 0.9) {
      return "强蓄力";
    }
    return "满弓";
  }

  private getChargeHint(chargeRatio: number): string {
    if (this.playerCombat.mode !== "aiming" && this.playerCombat.mode !== "charging") {
      return "按住右键进入瞄准";
    }
    if (this.playerCombat.mode !== "charging") {
      return "按住左键开始蓄力，白线会预览箭矢抛物线";
    }
    if (chargeRatio < 0.35) {
      return "当前适合近距离快射";
    }
    if (chargeRatio < 0.75) {
      return "当前适合中距离压掩体";
    }
    return "当前适合远距离抛射";
  }

  private createBowTexture(): THREE.CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) {
      return new THREE.CanvasTexture(canvas);
    }

    const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
    gradient.addColorStop(0, "#7b4d23");
    gradient.addColorStop(0.25, "#a36c36");
    gradient.addColorStop(0.5, "#d0a163");
    gradient.addColorStop(0.75, "#9b6633");
    gradient.addColorStop(1, "#6c431f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(58, 32, 12, 0.45)";
    context.lineWidth = 3;
    for (let x = 10; x < canvas.width; x += 18) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + 8, canvas.height);
      context.stroke();
    }

    context.strokeStyle = "rgba(247, 231, 188, 0.22)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(0, 6);
    context.lineTo(canvas.width, 10);
    context.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private getMinimapPoint(position: THREE.Vector3, forward?: THREE.Vector3): {
    x: number;
    y: number;
    headingDegrees: number;
  } {
    const arenaHalf = GAME_CONFIG.arenaSize * 0.5;
    const x = THREE.MathUtils.clamp(((position.x + arenaHalf) / GAME_CONFIG.arenaSize) * 100, 0, 100);
    const y = THREE.MathUtils.clamp((1 - (position.z + arenaHalf) / GAME_CONFIG.arenaSize) * 100, 0, 100);
    return {
      x,
      y,
      headingDegrees: forward ? THREE.MathUtils.radToDeg(Math.atan2(forward.x, forward.z)) : 0
    };
  }

  private updateActorRecovery(deltaSeconds: number): void {
    const actors = [this.player, ...this.enemies.map((enemy) => enemy.actor)];
    for (const actor of actors) {
      const still = actor.velocity.lengthSq() <= 0.02;
      const canRecover =
        actor.lifeState === "alive" &&
        actor.combatMode !== "charging" &&
        actor.combatMode !== "cooldown";

      actor.stationaryTime = still ? actor.stationaryTime + deltaSeconds : 0;

      if (
        canRecover &&
        actor.stationaryTime >= GAME_CONFIG.ai.selfHealDelay &&
        actor.health < actor.maxHealth
      ) {
        actor.health = Math.min(
          actor.maxHealth,
          actor.health + GAME_CONFIG.ai.selfHealRate * deltaSeconds
        );
      }
    }
  }

  private finalizeEnemyDeaths(timeSeconds: number): void {
    for (const enemy of this.enemies) {
      if (
        enemy.actor.lifeState === "dead" &&
        !this.deathCrates.some((crate) => crate.enemyId === enemy.actor.id)
      ) {
        this.spawnDeathCrate(enemy.actor.id, enemy.actor.position);
        this.pushHudMessage("敌人阵亡并掉落战利品箱", timeSeconds);
      }
    }
  }

  private deploySmoke(
    throwerId: string,
    target: THREE.Vector3,
    reason: "rescue" | "attack"
  ): boolean {
    const thrower = this.enemies.find((enemy) => enemy.actor.id === throwerId);
    if (!thrower || thrower.smokeCooldownRemaining > 0) {
      return false;
    }

    this.spawnSmokeCloud(target);
    thrower.smokeCooldownRemaining = GAME_CONFIG.ai.smokeCooldown;
    this.pushHudMessage(reason === "rescue" ? "敌人投出烟雾掩护救援" : "敌人投出烟雾封锁视野", performance.now() / 1000);
    return true;
  }

  private updateSmokeClouds(deltaSeconds: number): void {
    this.playerSmokeCooldownRemaining = Math.max(
      0,
      this.playerSmokeCooldownRemaining - deltaSeconds
    );
    for (const enemy of this.enemies) {
      enemy.smokeCooldownRemaining = Math.max(0, enemy.smokeCooldownRemaining - deltaSeconds);
    }

    for (const cloud of this.smokeClouds) {
      cloud.state.age += deltaSeconds;
      const growth = Math.min(1, cloud.state.age / cloud.state.buildSeconds);
      const fade = Math.max(
        0,
        1 - Math.max(0, cloud.state.age - (cloud.state.lifeSeconds - 1.8)) / 1.8
      );
      for (const [index, puff] of cloud.puffs.entries()) {
        const scale = THREE.MathUtils.lerp(0.18, 1.45 + index * 0.1, growth);
        puff.scale.setScalar(scale);
        const material = puff.material as THREE.MeshStandardMaterial;
        material.opacity = 0.12 + growth * 0.28 * fade;
      }
    }

    for (let index = this.smokeClouds.length - 1; index >= 0; index -= 1) {
      const cloud = this.smokeClouds[index];
      if (cloud.state.age >= cloud.state.lifeSeconds) {
        this.scene.remove(cloud.group);
        this.smokeClouds.splice(index, 1);
      }
    }
  }

  private getSmokeObscureAlpha(): number {
    let maxAlpha = 0;
    for (const cloud of this.smokeClouds) {
      const distance = cloud.state.position.distanceTo(this.player.position);
      const radius = cloud.state.radius * Math.min(1, cloud.state.age / cloud.state.buildSeconds);
      if (distance <= radius) {
        const ratio = 1 - distance / Math.max(radius, 0.001);
        maxAlpha = Math.max(maxAlpha, 0.55 + ratio * 0.4);
      }
    }
    return maxAlpha;
  }

  private tryDeployPlayerSmoke(
    input: ReturnType<InputController["captureFrame"]>,
    timeSeconds: number
  ): void {
    if (!input.smokePressed || !this.player.isAlive) {
      return;
    }

    if (this.playerSmokeCooldownRemaining > 0) {
      this.pushHudMessage("烟雾弹还在冷却", timeSeconds);
      return;
    }

    const aimTarget = this.cameraRig.getAimTarget(this.world);
    const flatOffset = aimTarget.clone().sub(this.player.position).setY(0);
    if (flatOffset.lengthSq() < 0.0001) {
      flatOffset.copy(this.player.forward);
    }
    flatOffset.normalize();
    const smokeTarget = this.player.position
      .clone()
      .add(flatOffset.multiplyScalar(8))
      .setY(0.1);

    this.spawnSmokeCloud(smokeTarget);
    this.playerSmokeCooldownRemaining = GAME_CONFIG.ai.smokeCooldown;
    this.pushHudMessage("你投出了烟雾弹", timeSeconds);
  }

  private spawnSmokeCloud(target: THREE.Vector3): void {
    const state: SmokeCloudState = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      position: target.clone().setY(0.1),
      radius: GAME_CONFIG.smoke.radius,
      age: 0,
      buildSeconds: GAME_CONFIG.smoke.buildSeconds,
      lifeSeconds: GAME_CONFIG.smoke.lifeSeconds
    };
    const group = new THREE.Group();
    const puffs: THREE.Mesh[] = [];
    const offsets = [
      new THREE.Vector3(0, 0.5, 0),
      new THREE.Vector3(1.4, 0.9, 0.6),
      new THREE.Vector3(-1.2, 0.7, -0.8),
      new THREE.Vector3(0.8, 1.2, -1.2),
      new THREE.Vector3(-0.9, 1.05, 1.1),
      new THREE.Vector3(0.2, 1.45, 0.3)
    ];
    for (const offset of offsets) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(1.2, 10, 10),
        new THREE.MeshStandardMaterial({
          color: "#f7fafc",
          emissive: "#ffffff",
          emissiveIntensity: 0.12,
          transparent: true,
          opacity: 0.08,
          roughness: 0.95,
          depthWrite: false
        })
      );
      puff.position.copy(offset);
      puff.scale.setScalar(0.15);
      group.add(puff);
      puffs.push(puff);
    }
    group.position.copy(state.position);
    this.scene.add(group);
    this.smokeClouds.push({ state, group, puffs });
  }

  private killEnemy(enemy: EnemyAgent, timeSeconds: number, message: string): void {
    enemy.actor.lifeState = "dead";
    enemy.actor.isAlive = false;
    enemy.actor.health = 0;
    enemy.actor.downedHealth = 0;
    enemy.actor.velocity.set(0, 0, 0);
    enemy.actor.combatMode = "dead";
    enemy.state = "Dead";
    enemy.stateTimer = 0;
    this.pushHudMessage(message, timeSeconds);
  }

  private spawnDeathCrate(enemyId: string, position: THREE.Vector3): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.48, 0.34, 0.48),
      new THREE.MeshStandardMaterial({
        color: "#826746",
        emissive: "#4b3420",
        emissiveIntensity: 0.12,
        roughness: 0.7
      })
    );
    mesh.castShadow = true;
    mesh.position.copy(position).setY(0.18);
    this.scene.add(mesh);
    this.deathCrates.push({
      enemyId,
      position: position.clone(),
      mesh
    });
  }

  private resetRound(): void {
    this.projectileSystem.reset();
    this.coverNodes.forEach((node) => {
      node.occupiedBy = null;
    });
    for (const crate of this.deathCrates) {
      this.scene.remove(crate.mesh);
    }
    this.deathCrates.length = 0;
    for (const smoke of this.smokeClouds) {
      this.scene.remove(smoke.group);
    }
    this.smokeClouds.length = 0;

    this.player.position.copy(PLAYER_SPAWN);
    this.player.forward.set(0, 0, -1);
    this.player.desiredForward.copy(this.player.forward);
    this.player.velocity.set(0, 0, 0);
    this.player.isCrouching = false;
    this.player.peekDirection = 0;
    this.player.health = this.player.maxHealth;
    this.player.isAlive = true;
    this.player.lifeState = "alive";
    this.player.downedHealth = 0;
    this.player.stationaryTime = 0;
    this.player.reviveProgress = 0;
    this.player.bleedoutTimer = 0;
    this.player.hitFlash = 0;
    this.playerCombat.mode = "idle";
    this.playerCombat.chargeSeconds = 0;
    this.playerCombat.cooldownRemaining = 0;
    this.playerSmokeCooldownRemaining = 0;
    this.trajectoryLine.visible = false;
    this.trajectoryImpactMarker.visible = false;

    for (const [index, enemy] of this.enemies.entries()) {
      enemy.actor.position.copy(ENEMY_SPAWNS[index]);
      enemy.actor.forward.copy(getForwardFromYaw(index === 0 ? -2.35 : 2.6));
      enemy.actor.desiredForward.copy(enemy.actor.forward);
      enemy.actor.velocity.set(0, 0, 0);
      enemy.actor.isCrouching = false;
      enemy.actor.health = enemy.actor.maxHealth;
      enemy.actor.isAlive = true;
      enemy.actor.lifeState = "alive";
      enemy.actor.downedHealth = 0;
      enemy.actor.stationaryTime = 0;
      enemy.actor.reviveProgress = 0;
      enemy.actor.bleedoutTimer = 0;
      enemy.actor.hitFlash = 0;
      enemy.actor.combatMode = "idle";
      enemy.state = "Patrol";
      enemy.stateTimer = 0;
      enemy.attackCooldownRemaining = 1.2 + index * 0.6;
      enemy.smokeCooldownRemaining = index * 0.8;
      enemy.perception.exposure = 0;
      enemy.perception.lastKnownTarget = null;
      enemy.targetCoverId = null;
      enemy.assignedAllyId = null;
      enemy.tacticTarget = null;
      enemy.crawlTarget = null;
    }

    this.overlay = "intro";
    this.input.exitPointerLock();
  }
}

export async function createGame(root: HTMLElement): Promise<void> {
  await RAPIER.init();
  const game = new ShootingGame(root);
  game.start();
}
