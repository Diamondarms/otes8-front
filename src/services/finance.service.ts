import {
  Injectable,
  signal,
  computed,
  WritableSignal,
  Signal,
} from '@angular/core';
import {
  RegistroModel,
  MetaModel,
  UserModel,
  RecordTypeEnum,
  CategoryEnum,
  AppDashboardData,
  EducationalMessage,
} from '../models/finance.models';
import {
  getCurrentMesAno,
  getWeeksOfMonthFixed4,
  parseDate,
  getMesAnoFromDate,
} from '../utils/date.utils';

// Helper interface for the raw data from the backend
interface RawRegistroModel {
    id: string;
    date: string; // "2025-11-20T03:00:00.000Z"
    value: string;
    name: string;
    record_type: string; // "0", "1", "2"
    category: string | null;
    due_date: string | null;
    id_user: string; // Note this field name
}

@Injectable({
  providedIn: 'root',
})
export class FinanceService {
  private readonly apiUrl = '/api';

  // --- State Signals ---
  currentUser: WritableSignal<UserModel | null> = signal(null);
  private registros = signal<RegistroModel[]>([]);
  private metaDoMes = signal<MetaModel | null>(null);
  private selectedMesAno = signal<string>(getCurrentMesAno());
  public today: WritableSignal<Date>;

  constructor() {
    const savedTestDate = sessionStorage.getItem('kakebo-test-date');
    const initialDate = savedTestDate ? parseDate(savedTestDate) ?? new Date() : new Date();
    this.today = signal(initialDate);
  }

  // --- Sinais Públicos (ReadOnly) ---
  public registrosDoMes: Signal<RegistroModel[]> = this.registros.asReadonly();
  public metaDoMesAtual: Signal<MetaModel | null> =
    this.metaDoMes.asReadonly();

  public readonly categoriasGastoVariavel: string[] =
    Object.keys(CategoryEnum).filter(k => isNaN(Number(k)));

  // --- Computed Signals (Filtering) ---
  public entradasDoMes = computed(() =>
    this.registros().filter((r) => r.record_type === RecordTypeEnum.Entrada)
  );
  public gastosFixosDoMes = computed(() =>
    this.registros().filter((r) => r.record_type === RecordTypeEnum.GastoFixo)
  );
  public gastosVariaveisDoMes = computed(() =>
    this.registros().filter(
      (r) => r.record_type === RecordTypeEnum.GastoVariavel
    )
  );

  // --- Computed Signals (Business Logic) ---
  public userId = computed(() => this.currentUser()?.id);

  public totalEntradas = computed(() => {
    return this.entradasDoMes().reduce((sum, e) => sum + e.value, 0);
  });

  public totalGastosFixos = computed(() => {
    return this.gastosFixosDoMes().reduce((sum, g) => sum + g.value, 0);
  });

  public dinheiroDisponivelGastosVariaveis = computed(() => {
    const meta = this.metaDoMes()?.value || 0;
    return this.totalEntradas() - this.totalGastosFixos() - meta;
  });

  public totalGastosVariaveisEfetivados = computed(() => {
    return this.gastosVariaveisDoMes().reduce((sum, g) => sum + g.value, 0);
  });

  public gastosVariaveisAvistaCategorias = computed(() => {
    const totais: Record<string, number> = {};
    this.categoriasGastoVariavel.forEach((cat) => (totais[cat] = 0));
    this.gastosVariaveisDoMes().forEach((g) => {
      if (g.category !== undefined && g.category !== null) {
        const categoryName = CategoryEnum[g.category];
        if (categoryName) {
            totais[categoryName] = (totais[categoryName] || 0) + g.value;
        }
      }
    });
    return totais;
  });

  public dashboardData = computed<AppDashboardData | null>(() => {
    if (!this.currentUser()) {
      return null;
    }
    return this.calculateDashboardData(this.selectedMesAno());
  });
  
  public educationalMessage = computed<EducationalMessage | null>(() => {
    const registros = this.registros();
    const meta = this.metaDoMes();
    const dashboard = this.dashboardData();
    const isPast = this.selectedMesAno() < getMesAnoFromDate(this.today());

    if (!dashboard || isPast) {
        return null;
    }

    // First record of the month
    if (registros.length === 1) {
        return { type: 'FIRST_RECORD' };
    }

    if (!meta || meta.value <= 0) {
        return null; // No goal set, no goal-related messages
    }
    
    // Goal achieved
    if (dashboard.comparativoMeta.economizadoReal >= meta.value) {
        return { type: 'GOAL_ACHIEVED', data: { metaValue: meta.value } };
    }

    // Goal near
    if (dashboard.metaProgressoRealPercentual >= 80) {
        return { type: 'GOAL_NEAR', data: { metaValue: meta.value } };
    }

    return null;
  });


  private getRequestHeaders(): Headers {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const userId = this.userId();
    if (userId) {
      headers.append('x-user-id', userId.toString());
    }
    return headers;
  }

  private mapBackendRegistroToFrontend(raw: RawRegistroModel): RegistroModel {
    const mapRecordType = (type: string): RecordTypeEnum => {
        switch (type) {
            case '0': return RecordTypeEnum.Entrada;
            case '1': return RecordTypeEnum.GastoFixo;
            case '2': return RecordTypeEnum.GastoVariavel;
            default:
                console.warn(`Tipo de registro desconhecido recebido do backend: ${type}`);
                return RecordTypeEnum.GastoVariavel; // Fallback, ou pode lançar um erro
        }
    };

    return {
        id: parseInt(raw.id, 10),
        name: raw.name,
        value: parseFloat(raw.value),
        date: raw.date.substring(0, 10), // THE FIX
        record_type: mapRecordType(raw.record_type),
        category: raw.category !== null ? parseInt(raw.category, 10) : undefined,
        due_date: raw.due_date ? raw.due_date.substring(0, 10) : undefined, // THE FIX
        user_id: parseInt(raw.id_user, 10),
    };
  }

  private calculateDashboardData(mes_ano_referencia: string): AppDashboardData {
    const totalEntradas = this.totalEntradas();
    const totalGastosFixos = this.totalGastosFixos();
    const totalGastosVariaveis = this.totalGastosVariaveisEfetivados();
    const metaDefinida = this.metaDoMes()?.value || 0;
    const disponivelVariaveis = this.dinheiroDisponivelGastosVariaveis();
    const economizadoReal =
      totalEntradas - totalGastosFixos - totalGastosVariaveis;

    let metaProgressoRealPercentual = 0;
    if (metaDefinida > 0) {
      metaProgressoRealPercentual = Math.max(
        0,
        (economizadoReal / metaDefinida) * 100
      );
    } else {
      metaProgressoRealPercentual = economizadoReal > 0 ? 100 : 0;
    }

    let saldoDisponivelVsEntradasPercentual = 0;
    if (totalEntradas > 0) {
      saldoDisponivelVsEntradasPercentual = Math.max(
        0,
        (disponivelVariaveis / totalEntradas) * 100
      );
    }

    return {
      dinheiroDisponivelGastosVariaveis: disponivelVariaveis,
      sugestaoGastoSemanal:
        this.readSugestaoGastoSemanalDinamica(mes_ano_referencia),
      relatorioGastosVariaveisSemanal:
        this.readRelatorioGastosVariaveisSemanalPorCategoriaESemana(
          mes_ano_referencia
        ),
      dinheiroEconomizadoNoOrcamentoVariavel:
        disponivelVariaveis - totalGastosVariaveis,
      comparativoMeta: {
        meta: metaDefinida,
        economizadoReal,
        diferenca: economizadoReal - metaDefinida,
      },
      saldoDisponivelVsEntradasPercentual,
      metaProgressoRealPercentual,
      totalEntradas,
      totalGastosFixos,
      totalGastosVariaveisAvista: totalGastosVariaveis,
      gastosVariaveisAvistaCategorias: this.gastosVariaveisAvistaCategorias(),
    };
  }

  private readSugestaoGastoSemanalDinamica(
    mes_ano_referencia: string
  ): number {
    const todayForCalc = this.today();
    const todayMesAno = getMesAnoFromDate(todayForCalc);
    
    let effectiveDate = todayForCalc;

    if (mes_ano_referencia > todayMesAno) {
        effectiveDate = parseDate(`${mes_ano_referencia}-01`)!;
    } else if (mes_ano_referencia < todayMesAno) {
        const [year, month] = mes_ano_referencia.split('-').map(Number);
        effectiveDate = new Date(year, month, 0); // Last day of the month
    }

    const disponivel = this.dinheiroDisponivelGastosVariaveis();
    const gastoAteAgora = this.totalGastosVariaveisEfetivados();
    const saldoVariavelRestante = disponivel - gastoAteAgora;

    // If there's no money left for variable expenses, or already overspent, the suggestion is always 0.
    if (saldoVariavelRestante <= 0) {
        return 0;
    }

    const semanasFixasDoMes = getWeeksOfMonthFixed4(mes_ano_referencia);
    if (semanasFixasDoMes.length === 0) return saldoVariavelRestante;

    const today = new Date(effectiveDate.setHours(0, 0, 0, 0));
    const semanasRestantes = semanasFixasDoMes.filter(
      (semana) => today <= semana.endDate
    ).length;

    // If no weeks are left in the period, the suggestion is whatever is left.
    if (semanasRestantes === 0) {
      return saldoVariavelRestante;
    }
    
    // Otherwise, divide the remaining balance by the number of remaining weeks.
    return saldoVariavelRestante / semanasRestantes;
  }

  private readRelatorioGastosVariaveisSemanalPorCategoriaESemana(
    mes_ano_referencia: string
  ): Record<string, Record<string, number>> {
    const relatorio: Record<string, Record<string, number>> = {};
    this.categoriasGastoVariavel.forEach((cat) => (relatorio[cat] = {}));
    const semanasDoMes = getWeeksOfMonthFixed4(mes_ano_referencia);

    semanasDoMes.forEach((semana) => {
      this.categoriasGastoVariavel.forEach((cat) => {
        relatorio[cat][semana.label] = 0;
      });
    });

    this.gastosVariaveisDoMes().forEach((gasto) => {
      const dataGasto = parseDate(gasto.date);
      if (!dataGasto || gasto.category === undefined || gasto.category === null) return;

      const categoryName = CategoryEnum[gasto.category];
      if (!categoryName) return;

      const semanaCorrespondente = semanasDoMes.find(
        (s) => dataGasto >= s.startDate && dataGasto <= s.endDate
      );
      if (semanaCorrespondente && relatorio[categoryName]) {
        relatorio[categoryName][semanaCorrespondente.label] += gasto.value;
      }
    });
    return relatorio;
  }

  public readGastosVariaveisAvistaParaSemana(
    weekStartDate: Date,
    weekEndDate: Date
  ): RegistroModel[] {
    const startOfDayWeekStart = new Date(weekStartDate.setHours(0, 0, 0, 0));
    const endOfDayWeekEnd = new Date(weekEndDate.setHours(23, 59, 59, 999));
    return this.gastosVariaveisDoMes().filter((g) => {
      const gastoDate = parseDate(g.date);
      return (
        gastoDate &&
        gastoDate >= startOfDayWeekStart &&
        gastoDate <= endOfDayWeekEnd
      );
    });
  }

  async login(name: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/user`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao fazer login');
    }
    const user = await response.json();
    this.currentUser.set(user);
    await this.setMesAno(getCurrentMesAno());
  }

  logout() {
    this.currentUser.set(null);
    this.registros.set([]);
    this.metaDoMes.set(null);
    this.selectedMesAno.set(getCurrentMesAno());
  }

  async setMesAno(mes_ano: string) {
    this.selectedMesAno.set(mes_ano);
    const userId = this.userId();
    if (!userId) {
      this.registros.set([]);
      this.metaDoMes.set(null);
      return;
    }

    const dateForBackend = `${mes_ano}-01`;

    try {
      const [registrosRes, metaRes] = await Promise.all([
        fetch(`${this.apiUrl}/registros/date/${dateForBackend}`, {
          headers: this.getRequestHeaders(),
        }),
        fetch(`${this.apiUrl}/meta/date/${dateForBackend}`, {
          headers: this.getRequestHeaders(),
        }),
      ]);

      if (registrosRes.ok) {
        const rawRegistros: RawRegistroModel[] = await registrosRes.json();
        const mappedRegistros = rawRegistros.map(r => this.mapBackendRegistroToFrontend(r));
        this.registros.set(mappedRegistros);
      } else {
        console.error(
          'Erro ao buscar registros:',
          await registrosRes.text()
        );
        this.registros.set([]);
      }

      if (metaRes.ok) {
        const metaData = await metaRes.json();
        if (metaData && metaData.id) {
            const mappedMeta: MetaModel = {
                id: parseInt(metaData.id, 10),
                value: parseFloat(metaData.value),
                date: metaData.date.substring(0, 7),
                user_id: parseInt(metaData.user_id, 10),
            };
            this.metaDoMes.set(mappedMeta);
        } else {
          this.metaDoMes.set(null);
        }
      } else {
        console.error('Erro ao buscar meta:', await metaRes.text());
        this.metaDoMes.set(null);
      }
    } catch (error) {
      console.error('Falha ao buscar dados do mês:', error);
      this.registros.set([]);
      this.metaDoMes.set(null);
    }
  }

  private async refreshData(mes_ano: string) {
    await this.setMesAno(mes_ano);
  }

  async createEntrada(name: string, value: number, date: string) {
    const userId = this.userId();
    if (!userId) throw new Error('Usuário não autenticado.');

    const payload = { name, value: Number(value), date, user_id: userId };
    const response = await fetch(`${this.apiUrl}/registros/entrada`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error((await response.json()).error);

    await this.refreshData(date.substring(0, 7));
  }

  async createGastoFixo(
    name: string,
    value: number,
    date: Date,
    due_date: Date
  ) {
    const userId = this.userId();
    if (!userId) throw new Error('Usuário não autenticado.');

    const payload = { name, value: Number(value), date, due_date, user_id: userId };
    const response = await fetch(`${this.apiUrl}/registros/gasto_fixo`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    
    const mesAno = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    await this.refreshData(mesAno);
  }

  async createGastoVariavel(
    name: string,
    value: number,
    date: string,
    category: string
  ) {
    const userId = this.userId();
    if (!userId) throw new Error('Usuário não autenticado.');
    
    const categoryIndex = CategoryEnum[category as keyof typeof CategoryEnum];

    const payload = {
      name,
      value: Number(value),
      date,
      category: categoryIndex,
      user_id: userId,
    };
    const response = await fetch(`${this.apiUrl}/registros/gasto_variavel`, {
      method: 'POST',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error((await response.json()).error);

    await this.refreshData(date.substring(0, 7));
  }

  async updateGastoFixo(
    id: number,
    mes_ano_original: string,
    updatedData: { name: string; value: number; date: Date; due_date: Date }
  ) {
    const payload = { id, ...updatedData };
    const response = await fetch(`${this.apiUrl}/registros/gasto_fixo`, {
      method: 'PUT',
      headers: this.getRequestHeaders(),
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error((await response.json()).error);
    
    await this.refreshData(mes_ano_original);
    
    const updatedMesAno = `${updatedData.date.getFullYear()}-${(updatedData.date.getMonth() + 1).toString().padStart(2, '0')}`;
    if (updatedMesAno !== mes_ano_original) {
        await this.refreshData(updatedMesAno);
    }
  }

  async deleteRegistro(id: number, mes_ano_referencia: string) {
    const response = await fetch(`${this.apiUrl}/registros/id/${id}`, {
      method: 'DELETE',
      headers: this.getRequestHeaders(),
    });
    if (!response.ok && response.status !== 204) throw new Error((await response.json()).error);
    await this.refreshData(mes_ano_referencia);
  }

  async updateMeta(value: number, mes_ano_referencia: string) {
    const userId = this.userId();
    if (!userId) throw new Error('Usuário não autenticado.');

    const metaExistente = this.metaDoMes();

    if (metaExistente) {
      const payload = { id: metaExistente.id, value: Number(value) };
      const response = await fetch(`${this.apiUrl}/meta`, {
        method: 'PUT',
        headers: this.getRequestHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json()).error);
    } else {
      const payload = {
        value: Number(value),
        date: `${mes_ano_referencia}-01`,
        user_id: userId,
      };
      const response = await fetch(`${this.apiUrl}/meta`, {
        method: 'POST',
        headers: this.getRequestHeaders(),
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error((await response.json()).error);
    }
    await this.refreshData(mes_ano_referencia);
  }

  async setTestDate(dateString: string | null) {
    if (dateString) {
        const newDate = parseDate(dateString);
        if (newDate) {
            sessionStorage.setItem('kakebo-test-date', dateString);
            this.today.set(newDate);
        }
    } else { // Reset
        sessionStorage.removeItem('kakebo-test-date');
        this.today.set(new Date());
    }
    await this.setMesAno(this.selectedMesAno()); 
  }
}