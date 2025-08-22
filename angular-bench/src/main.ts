import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { BenchComponent } from './app/bench.component';

bootstrapApplication(BenchComponent, appConfig)
  .catch((err) => console.error(err));
