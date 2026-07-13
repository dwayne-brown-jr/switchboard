import { registerRootComponent } from "expo";
import App from "./App";

// Explicit entry point (avoids ambiguity vs. expo-router).
registerRootComponent(App);
