import { render } from "solid-js/web";

import { Playground } from "./Playground.tsx";

const root = document.getElementById("root");
if (root) render(() => <Playground />, root);
