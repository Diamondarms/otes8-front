import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule, formatCurrency, formatDate } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService } from './services/finance.service';
import { WeekDateRangeFixed, RegistroModel, RecordTypeEnum, CategoryEnum, EducationalMessage } from './models/finance.models';
import { getCurrentMesAno, getMesAnoFromDate, parseDate, getWeeksOfMonthFixed4 } from './utils/date.utils';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  financeService = inject(FinanceService);
  
  // --- Enums for template access ---
  RecordTypeEnum = RecordTypeEnum;
  CategoryEnum = CategoryEnum;

  isLoggedIn = computed(() => !!this.financeService.currentUser());
  currentMesAno = signal(getCurrentMesAno());
  message = signal<{ type: 'success' | 'error'; text: string } | null>(null);
  openSections = signal<Record<string, boolean>>({});

  quickEditModalConfig = signal<{ type: RecordTypeEnum; item?: RegistroModel; mode: 'add' | 'edit'; } | null>(null);
  isWeekDetailsModalOpen = signal(false);
  selectedWeekForDetails = signal<WeekDateRangeFixed | null>(null);
  isCalendarPickerOpen = signal(false);
  displayYear = signal(new Date().getFullYear());
  readonly months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

  loginName = signal('');
  loginError = signal('');
  
  modalFormData: any = {};
  
  appData = this.financeService.dashboardData;

  formattedCurrentMonthForDisplay = computed(() => {
    const [year, month] = this.currentMesAno().split('-').map(Number);
    return new Date(year, month - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  });
  
  // QA Tool state
  isTestDatePopoverOpen = signal(false);
  testDateInput = signal(this.financeService.today().toISOString().substring(0, 10));
  today = this.financeService.today;
  
  isPastMonth = computed(() => {
    const today = this.financeService.today();
    const selected = this.currentMesAno(); // "YYYY-MM"
    const todayMesAno = getMesAnoFromDate(today);
    return selected < todayMesAno;
  });

  isFutureMonth = computed(() => {
    const today = this.financeService.today();
    const selected = this.currentMesAno(); // "YYYY-MM"
    const todayMesAno = getMesAnoFromDate(today);
    return selected > todayMesAno;
  });

  weeksOfMonthFixed = computed(() => getWeeksOfMonthFixed4(this.currentMesAno()));
  
  gastosDaSemana = computed(() => {
    const week = this.selectedWeekForDetails();
    if (this.isWeekDetailsModalOpen() && week) {
        return this.financeService.readGastosVariaveisAvistaParaSemana(week.startDate, week.endDate);
    }
    return [];
  });

  isMetaEditing = signal(false);
  editableMetaValor = signal("0");

  // Educational Messages
  isEducationalMessageVisible = signal(true);
  educationalMessage = this.financeService.educationalMessage;

  constructor() {
    effect(() => {
        const [year] = this.currentMesAno().split('-').map(Number);
        this.displayYear.set(year);
    });

    effect(() => {
      if(this.isLoggedIn()) {
        this.financeService.setMesAno(this.currentMesAno());
      }
    })

    effect(() => {
      // Reset visibility when month changes
      this.currentMesAno(); // depend on this signal
      this.isEducationalMessageVisible.set(true);
    });
  }

  formatCurrency(value: number | undefined | null): string {
    if (value === undefined || value === null || isNaN(value)) return 'R$ 0,00';
    return formatCurrency(value, 'pt-BR', 'BRL');
  }

  formatDate(date: Date | string | undefined, format: string, locale: string): string {
    if (!date) return '';
    const parsed = parseDate(date);
    return parsed ? formatDate(parsed, format, locale) : 'Data Inválida';
  }

  getCategoryName(category: CategoryEnum | undefined | null): string {
    if (category === undefined || category === null) return '';
    const name = CategoryEnum[category];
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
  }

  dismissEducationalMessage() {
    this.isEducationalMessageVisible.set(false);
  }

  formatEducationalMessage(message: EducationalMessage): { title: string; body: string } {
    switch(message.type) {
      case 'FIRST_RECORD':
        return {
          title: 'Bom Começo!',
          body: 'Parabéns! Registrar seu primeiro item é o passo mais importante para organizar o mês.'
        };
      case 'GOAL_NEAR':
        return {
          title: 'Você está quase lá!',
          body: `Falta pouco para atingir sua meta de economia de ${this.formatCurrency(message.data.metaValue)}. Continue assim!`
        };
      case 'GOAL_ACHIEVED':
        return {
          title: 'Meta Atingida!',
          body: `Parabéns! Você alcançou (ou ultrapassou) sua meta de economia de ${this.formatCurrency(message.data.metaValue)}.`
        };
      default:
        return { title: '', body: '' };
    }
  }

  async handleLogin(event: Event) {
    event.preventDefault();
    this.loginError.set('');
    if (!this.loginName()) {
        this.loginError.set('Por favor, insira seu nome.');
        return;
    }
    try {
        await this.financeService.login(this.loginName());
    } catch(e: any) {
        this.loginError.set(e.message || 'Ocorreu um erro.');
    }
  }

  handleLogout() {
    this.financeService.logout();
    this.showMessage('Você saiu com sucesso.', 'success');
    this.currentMesAno.set(getCurrentMesAno());
  }

  navigateMonth(direction: 'prev' | 'next' | string) {
    if (direction === 'prev' || direction === 'next') {
        const [year, month] = this.currentMesAno().split('-').map(Number);
        const currentDate = new Date(year, month - 1, 15);
        currentDate.setMonth(currentDate.getMonth() + (direction === 'prev' ? -1 : 1));
        this.currentMesAno.set(getMesAnoFromDate(currentDate));
    } else {
        this.currentMesAno.set(direction);
    }
    this.message.set(null);
  }

  toggleSection(section: string) {
    this.openSections.update((prev) => ({ ...prev, [section]: !prev[section] }));
  }

  showMessage(text: string, type: 'success' | 'error' = 'success') {
    this.message.set({ type, text });
    setTimeout(() => this.message.set(null), type === 'success' ? 3000 : 5000);
  }
  
  async handleDeleteFromCollapsible(item: RegistroModel) {
    if (!window.confirm(`Deletar "${item.name}"?`)) return;

    try {
        const mesAno = item.date.substring(0, 7);
        await this.financeService.deleteRegistro(item.id, mesAno);
        this.showMessage('Item deletado!');
    } catch (error: any) {
      this.showMessage(`Erro ao deletar: ${error.message}`, 'error');
    }
  }
  
  handleMetaValueClick(metaInput: HTMLInputElement) {
    this.editableMetaValor.set(this.financeService.metaDoMesAtual()?.value?.toString() || "0");
    this.isMetaEditing.set(true);
    setTimeout(() => metaInput?.focus(), 0);
  }
  
  async handleMetaValueBlurOrEnter() {
    this.isMetaEditing.set(false);
    const newValor = parseFloat(this.editableMetaValor());
    if (isNaN(newValor) || newValor < 0) { this.showMessage('Valor da meta inválido.', 'error'); return; }
    
    try {
      await this.financeService.updateMeta(newValor, this.currentMesAno());
      this.showMessage('Meta de economia atualizada!');
    } catch (error: any) {
      this.showMessage(`Erro ao atualizar meta: ${error.message}`, 'error');
    }
  }

  handleOpenQuickEditModal(type: RecordTypeEnum, mode: 'add' | 'edit', item?: RegistroModel) {
    const defaultDate = this.getDefaultDateForCurrentMonth();
    if (mode === 'edit' && item) {
      this.modalFormData = { ...item };
      if (type === RecordTypeEnum.GastoFixo) {
        this.modalFormData.date = item.date.substring(0, 7); // For month input
        this.modalFormData.due_date = item.due_date ? item.due_date.substring(0, 7) : '';
      }
    } else {
      this.modalFormData = 
        type === RecordTypeEnum.Entrada ? { name: '', value: '', date: defaultDate } :
        type === RecordTypeEnum.GastoFixo ? { name: '', value: '', date: this.currentMesAno(), due_date: this.currentMesAno() } :
        { name: '', value: '', date: defaultDate, category: this.financeService.categoriasGastoVariavel[0] };
    }
    this.quickEditModalConfig.set({ type, item, mode });
  }
  
  handleCloseQuickEditModal() {
    this.quickEditModalConfig.set(null);
    this.modalFormData = {};
  }

  async handleQuickEditModalSave(event: Event, type: RecordTypeEnum) {
    event.preventDefault();
    const config = this.quickEditModalConfig();
    if (!config) return;

    try {
      const { mode, item } = config;
      const data = this.modalFormData;
      
      let promise;
      if (type === RecordTypeEnum.Entrada) {
        promise = this.financeService.createEntrada(data.name, data.value, data.date);
      } else if (type === RecordTypeEnum.GastoFixo) {
        const [year, month] = data.date.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        
        const [dueYear, dueMonth] = data.due_date.split('-').map(Number);
        const due_date = new Date(dueYear, dueMonth - 1, 1);

        if (mode === 'add') {
          promise = this.financeService.createGastoFixo(data.name, data.value, date, due_date);
        } else if (item) {
          promise = this.financeService.updateGastoFixo(item.id, item.date.substring(0, 7), { name: data.name, value: data.value, date, due_date });
        }
      } else { // Gasto Variavel
        promise = this.financeService.createGastoVariavel(data.name, data.value, data.date, data.category);
      }
      
      if (promise) await promise;
      this.showMessage(`Item ${mode === 'add' ? 'adicionado' : 'atualizado'}!`, 'success');
      this.handleCloseQuickEditModal();
    } catch (error: any) {
      this.showMessage(`Erro: ${error.message}`, 'error');
    }
  }

  handleOpenWeekDetails(week: WeekDateRangeFixed) {
    this.selectedWeekForDetails.set(week);
    this.isWeekDetailsModalOpen.set(true);
  }
  
  getWeekTotal(week: WeekDateRangeFixed, relatorio: Record<string, Record<string, number>> | undefined): number {
    if (!relatorio) return 0;
    return this.financeService.categoriasGastoVariavel.reduce((sum, cat) => sum + (relatorio[cat]?.[week.label] || 0), 0);
  }

  // Handlers do Seletor de Calendário
  decrementDisplayYear() { this.displayYear.update(y => y - 1); }
  incrementDisplayYear() { this.displayYear.update(y => y + 1); }

  selectMonthYear(year: number, month: number) {
    this.navigateMonth(`${year}-${month.toString().padStart(2, '0')}`);
    this.isCalendarPickerOpen.set(false);
  }
  
  isSelectedMonth(year: number, month: number): boolean {
    return this.currentMesAno() === `${year}-${month.toString().padStart(2, '0')}`;
  }
  
  private getDefaultDateForCurrentMonth(): string {
    const [year, month] = this.currentMesAno().split('-').map(Number);
    const today = new Date();
    const dateToFormat = today.getFullYear() === year && today.getMonth() === month - 1 ? today : new Date(year, month - 1, 1);
    return this.formatDate(dateToFormat, 'yyyy-MM-dd', 'pt-BR');
  }

  async handleSetTestDate() {
    if (this.testDateInput()) {
        await this.financeService.setTestDate(this.testDateInput());
        this.showMessage('Data de teste definida!', 'success');
    } else {
        await this.financeService.setTestDate(null); // Reset
        this.showMessage('Data de teste redefinida para hoje.', 'success');
    }
    this.isTestDatePopoverOpen.set(false);
  }
}