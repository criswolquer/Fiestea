import "./styles/tokens.css";
import "./styles/components.css";
import "./styles/design.css";
import { designPage } from "./design";
import { h } from "./ui/dom";

const app = document.getElementById("app")!;

function route(): void {
  const path = location.hash.replace(/^#/, "") || "/";
  if (path.startsWith("/design")) {
    app.replaceChildren(designPage());
    return;
  }
  // Las pantallas llegan con /replica-build. De momento, un enlace al sistema de diseño.
  app.replaceChildren(h("main", { class: "page" },
    h("h1", {}, "Ahorro"),
    h("p", {}, "La app aún no está construida."),
    h("a", { href: "#/design" }, "Ver el sistema de diseño"),
  ));
}

window.addEventListener("hashchange", route);
route();
