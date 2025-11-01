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
			<h2 class="section-title">Por hacer</h2>
			<div class="bg-gray-50 rounded-lg p-3 min-h-64 space-y-2 border border-gray-200">
				<div class="card bg-white shadow" *ngFor="let c of todo">
					<div class="card-body p-4">
						<div class="font-medium">{{ c.title }}</div>
						<div class="text-xs text-gray-600" *ngIf="c.description">{{ c.description }}</div>
					</div>
				</div>
			</div>
		</div>
		<div class="space-y-3">
			<h2 class="section-title">En progreso</h2>
			<div class="bg-gray-50 rounded-lg p-3 min-h-64 space-y-2 border border-gray-200">
				<div class="card bg-white shadow" *ngFor="let c of doing">
					<div class="card-body p-4">
						<div class="font-medium">{{ c.title }}</div>
						<div class="text-xs text-gray-600" *ngIf="c.description">{{ c.description }}</div>
					</div>
				</div>
			</div>
		</div>
		<div class="space-y-3">
			<h2 class="section-title">Hecho</h2>
			<div class="bg-gray-50 rounded-lg p-3 min-h-64 space-y-2 border border-gray-200">
				<div class="card bg-white shadow" *ngFor="let c of done">
					<div class="card-body p-4">
						<div class="font-medium">{{ c.title }}</div>
						<div class="text-xs text-gray-600" *ngIf="c.description">{{ c.description }}</div>
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
