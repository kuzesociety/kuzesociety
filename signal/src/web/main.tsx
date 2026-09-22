import { render } from "preact";
import { App } from "./app";
import { setState } from "./store";

setState({});
render(<App />, document.getElementById("root")!);
