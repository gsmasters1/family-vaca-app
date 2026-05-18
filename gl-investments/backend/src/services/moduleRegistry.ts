import { Router } from "express";
import { isModuleEnabled } from "./appConfig";

export interface AppModule {
  id: string;
  name: string;
  description: string;
  version: string;
  router?: Router;
  mountPath?: string;
  init?: () => Promise<void>;
}

class ModuleRegistry {
  private readonly modules = new Map<string, AppModule>();

  register(mod: AppModule): void {
    this.modules.set(mod.id, mod);
  }

  isEnabled(id: string): boolean {
    return isModuleEnabled(id);
  }

  getAll(): AppModule[] {
    return Array.from(this.modules.values());
  }

  getEnabled(): AppModule[] {
    return this.getAll().filter((m) => this.isEnabled(m.id));
  }

  get(id: string): AppModule | undefined {
    return this.modules.get(id);
  }
}

export const registry = new ModuleRegistry();
