import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TuiRoot } from '@taiga-ui/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot],
  template: `<tui-root><router-outlet /></tui-root>`
})
export class App {
  protected readonly title = signal('taskforge-ui');
}
