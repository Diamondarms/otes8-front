export enum CategoryEnum {
    necessidade,
    desejo,
    cultura,
    inesperado
}

export enum RecordTypeEnum {
    Entrada = 'entrada',
    GastoFixo = 'gasto_fixo',
    GastoVariavel = 'gasto_variavel'
}

export interface RegistroModel {
    id: number;
    date: string; // YYYY-MM-DD
    value: number;
    name: string;
    record_type: RecordTypeEnum;
    category?: CategoryEnum;
    due_date?: string; // YYYY-MM-DD
    user_id: number;
}

export interface MetaModel {
    id: number;
    value: number;
    date: string; // YYYY-MM
    user_id: number;
}

export interface UserModel {
    id: number;
    name: string;
}

export interface WeekDateRangeFixed {
  weekOfMonth: number; // 1, 2, 3, 4
  startDate: Date;
  endDate: Date;
  label: string; // "Semana 1 (01-07)"
}

export interface AppDashboardData {
  dinheiroDisponivelGastosVariaveis: number;
  sugestaoGastoSemanal: number;
  relatorioGastosVariaveisSemanal: Record<string, Record<string, number>>;
  dinheiroEconomizadoNoOrcamentoVariavel: number;
  comparativoMeta: {
    meta: number;
    economizadoReal: number;
    diferenca: number;
  };
  percentualSaldoVariavelRestante: number;
  metaProgressoRealPercentual: number;
  totalEntradas: number;
  totalGastosFixos: number;
  totalGastosVariaveisAvista: number;
  gastosVariaveisAvistaCategorias: Record<string, number>;
}
