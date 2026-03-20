import "./styles.css";
import { createGame } from "./game/Game";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

void createGame(app).catch((error) => {
  console.error(error);
  app.innerHTML = "<p style='padding: 24px'>游戏初始化失败，请检查控制台。</p>";
});
