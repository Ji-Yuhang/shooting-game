type HudSnapshot = {
  playerHealth: number;
  enemyCount: number;
  totalEnemies: number;
  chargeRatio: number;
  chargePercent: number;
  chargeLabel: string;
  chargeHint: string;
  crosshairVisible: boolean;
  tags: string[];
  message: string;
  overlayTitle: string | null;
  overlayBody: string;
  minimapPlayer: {
    x: number;
    y: number;
    headingDegrees: number;
  };
  minimapEnemies: Array<{
    x: number;
    y: number;
  }>;
  minimapDeaths: Array<{
    x: number;
    y: number;
  }>;
  smokeOpacity: number;
};

export class HudController {
  readonly element: HTMLDivElement;

  private readonly playerHealthValue: HTMLDivElement;
  private readonly enemyValue: HTMLDivElement;
  private readonly chargeFill: HTMLDivElement;
  private readonly chargePercentValue: HTMLDivElement;
  private readonly chargeLabelValue: HTMLDivElement;
  private readonly chargeHintValue: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly message: HTMLDivElement;
  private readonly smokeVeil: HTMLDivElement;
  private readonly minimap: HTMLDivElement;
  private readonly minimapMarkers: HTMLDivElement;
  private readonly minimapPlayerMarker: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly overlayTitle: HTMLHeadingElement;
  private readonly overlayBody: HTMLParagraphElement;

  constructor() {
    this.element = document.createElement("div");
    this.element.className = "hud";
    this.element.innerHTML = `
      <div class="hud-top">
        <div class="hud-panel">
          <div class="hud-title">Player Health</div>
          <div class="hud-value" data-role="health"></div>
        </div>
        <div class="hud-panel">
          <div class="hud-title">Controls</div>
          <div class="controls">
            WASD 移动 / 右键瞄准 / 左键蓄力发射<br />
            C 蹲下 / Q E 探头 / G 烟雾弹 / Alt 自由观察 / R 重开 / Esc 暂停
          </div>
        </div>
        <div class="hud-panel">
          <div class="hud-title">Enemies</div>
          <div class="hud-value" data-role="enemies"></div>
        </div>
      </div>
      <div class="crosshair"></div>
      <div class="smoke-veil"></div>
      <div class="message"></div>
      <div class="overlay">
        <div class="overlay-card">
          <h1></h1>
          <p></p>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="hud-panel charge-panel">
          <div class="hud-title">Bow Charge</div>
          <div class="charge-meta">
            <div class="charge-percent"></div>
            <div class="charge-label"></div>
          </div>
          <div class="charge-track"><div class="charge-fill"></div></div>
          <div class="charge-hint"></div>
        </div>
        <div class="hud-status"></div>
      </div>
      <div class="hud-panel minimap-panel">
        <div class="hud-title">Minimap</div>
        <div class="minimap">
          <div class="minimap-grid"></div>
          <div class="minimap-markers">
            <div class="minimap-player"></div>
          </div>
        </div>
      </div>
    `;

    this.playerHealthValue = this.element.querySelector("[data-role=health]") as HTMLDivElement;
    this.enemyValue = this.element.querySelector("[data-role=enemies]") as HTMLDivElement;
    this.chargeFill = this.element.querySelector(".charge-fill") as HTMLDivElement;
    this.chargePercentValue = this.element.querySelector(".charge-percent") as HTMLDivElement;
    this.chargeLabelValue = this.element.querySelector(".charge-label") as HTMLDivElement;
    this.chargeHintValue = this.element.querySelector(".charge-hint") as HTMLDivElement;
    this.crosshair = this.element.querySelector(".crosshair") as HTMLDivElement;
    this.status = this.element.querySelector(".hud-status") as HTMLDivElement;
    this.message = this.element.querySelector(".message") as HTMLDivElement;
    this.smokeVeil = this.element.querySelector(".smoke-veil") as HTMLDivElement;
    this.minimap = this.element.querySelector(".minimap") as HTMLDivElement;
    this.minimapMarkers = this.element.querySelector(".minimap-markers") as HTMLDivElement;
    this.minimapPlayerMarker = this.element.querySelector(".minimap-player") as HTMLDivElement;
    this.overlay = this.element.querySelector(".overlay") as HTMLDivElement;
    this.overlayTitle = this.element.querySelector(".overlay-card h1") as HTMLHeadingElement;
    this.overlayBody = this.element.querySelector(".overlay-card p") as HTMLParagraphElement;
  }

  attach(root: HTMLElement): void {
    root.append(this.element);
  }

  render(snapshot: HudSnapshot): void {
    this.playerHealthValue.textContent = `${Math.max(0, Math.ceil(snapshot.playerHealth))}`;
    this.enemyValue.textContent = `${snapshot.enemyCount} / ${snapshot.totalEnemies}`;
    this.chargeFill.style.width = `${Math.round(snapshot.chargeRatio * 100)}%`;
    this.chargePercentValue.textContent = `${snapshot.chargePercent}%`;
    this.chargeLabelValue.textContent = snapshot.chargeLabel;
    this.chargeHintValue.textContent = snapshot.chargeHint;
    this.crosshair.classList.toggle("visible", snapshot.crosshairVisible);
    this.smokeVeil.style.opacity = snapshot.smokeOpacity.toFixed(2);
    this.message.textContent = snapshot.message;
    this.message.classList.toggle("visible", snapshot.message.length > 0);
    this.minimapPlayerMarker.style.left = `${snapshot.minimapPlayer.x}%`;
    this.minimapPlayerMarker.style.top = `${snapshot.minimapPlayer.y}%`;
    this.minimapPlayerMarker.style.transform = `translate(-50%, -50%) rotate(${snapshot.minimapPlayer.headingDegrees}deg)`;
    this.minimapMarkers.replaceChildren(
      this.minimapPlayerMarker,
      ...snapshot.minimapEnemies.map((enemy) => {
        const marker = document.createElement("div");
        marker.className = "minimap-enemy";
        marker.style.left = `${enemy.x}%`;
        marker.style.top = `${enemy.y}%`;
        return marker;
      }),
      ...snapshot.minimapDeaths.map((death) => {
        const marker = document.createElement("div");
        marker.className = "minimap-death";
        marker.style.left = `${death.x}%`;
        marker.style.top = `${death.y}%`;
        marker.textContent = "X";
        return marker;
      })
    );
    this.status.replaceChildren(
      ...snapshot.tags.map((tagText) => {
        const tag = document.createElement("div");
        tag.className = "tag";
        tag.textContent = tagText;
        return tag;
      })
    );

    const overlayVisible = snapshot.overlayTitle !== null;
    this.overlay.classList.toggle("visible", overlayVisible);
    this.overlayTitle.textContent = snapshot.overlayTitle ?? "";
    this.overlayBody.textContent = snapshot.overlayBody;
  }
}
