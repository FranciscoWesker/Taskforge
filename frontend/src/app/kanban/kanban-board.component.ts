import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

interface KanbanCard {
	id: string;
	title: string;
	description?: string;
}

@Component({
	selector: 'app-kanban-board',
	standalone: true,
    imports: [CommonModule],
	template: `
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
		<div class="space-y-3">
			<h2 class="section-title text-gray-700 dark:text-gray-300">Por hacer</h2>
			<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 min-h-64 space-y-2 border border-gray-200 dark:border-gray-700">
				<div class="card bg-white dark:bg-gray-700 shadow dark:shadow-gray-900/50" *ngFor="let c of todo">
					<div class="card-body p-4">
						<div class="font-medium text-gray-900 dark:text-gray-100">{{ c.title }}</div>
						<div class="text-xs text-gray-600 dark:text-gray-400" *ngIf="c.description">{{ c.description }}</div>
					</div>
				</div>
			</div>
		</div>
		<div class="space-y-3">
			<h2 class="section-title text-gray-700 dark:text-gray-300">En progreso</h2>
			<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 min-h-64 space-y-2 border border-gray-200 dark:border-gray-700">
				<div class="card bg-white dark:bg-gray-700 shadow dark:shadow-gray-900/50" *ngFor="let c of doing">
					<div class="card-body p-4">
						<div class="font-medium text-gray-900 dark:text-gray-100">{{ c.title }}</div>
						<div class="text-xs text-gray-600 dark:text-gray-400" *ngIf="c.description">{{ c.description }}</div>
					</div>
				</div>
			</div>
		</div>
		<div class="space-y-3">
			<h2 class="section-title text-gray-700 dark:text-gray-300">Hecho</h2>
			<div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 min-h-64 space-y-2 border border-gray-200 dark:border-gray-700">
				<div class="card bg-white dark:bg-gray-700 shadow dark:shadow-gray-900/50" *ngFor="let c of done">
					<div class="card-body p-4">
						<div class="font-medium text-gray-900 dark:text-gray-100">{{ c.title }}</div>
						<div class="text-xs text-gray-600 dark:text-gray-400" *ngIf="c.description">{{ c.description }}</div>
					</div>
				</div>
			</div>
		</div>
	</div>
	`,
	styles: []
})
export class KanbanBoardComponent {
	todo: KanbanCard[] = [
		{ id: '1', title: 'Configurar proyecto' },
		{ id: '2', title: 'Definir modelos' }
	];
	doing: KanbanCard[] = [
		{ id: '3', title: 'Tablero Kanban', description: 'UI estable de tablero' }
	];
	done: KanbanCard[] = [];
}
