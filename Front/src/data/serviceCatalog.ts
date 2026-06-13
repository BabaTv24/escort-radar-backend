export type ServiceOption = {
  key: string;
  label: string;
  category: string;
  is_active: boolean;
};

const labels = [
  ['encounters', '2k+1m'],
  ['encounters', '2m+1k'],
  ['classic', '69'],
  ['accessibility', 'Akceptuje osoby niepelnosprawne'],
  ['fetish', 'Crossdressing'],
  ['fetish', 'Cuckold'],
  ['appearance', 'Czesciowo ogolone'],
  ['oral', 'Deep throat'],
  ['fetish', 'Deptanie'],
  ['outdoor', 'Dogging'],
  ['fetish', 'Dominacja'],
  ['encounters', 'Duet z kolezanka'],
  ['time', 'Dwa zblizenia w godzinie'],
  ['privacy', 'Dyskrecja'],
  ['experience', 'Dziki seks'],
  ['oral', 'Face fucking'],
  ['fetish', 'Facesitting'],
  ['fetish', 'Femdom'],
  ['fetish', 'Fetysz butow'],
  ['fetish', 'Fetysz stop'],
  ['finish', 'Final na cialo'],
  ['finish', 'Final na twarz'],
  ['finish', 'Final w buzi'],
  ['fetish', 'Fisting'],
  ['fetish', 'Fisting analny aktywny'],
  ['fetish', 'Fisting analny pasywny'],
  ['fetish', 'Fisting pochwowy aktywny'],
  ['fetish', 'Fisting pochwowy pasywny'],
  ['fetish', 'Footjob'],
  ['oral', 'Francuz bez zabezpieczenia'],
  ['oral', 'Francuz w zabezpieczeniu'],
  ['encounters', 'Gang Bang'],
  ['classic', 'Gra wstepna'],
  ['classic', 'Handjob'],
  ['fetish', 'Headscissors'],
  ['roleplay', 'Inscenizowane scenki'],
  ['time', 'Jedno zblizenie w godzinie'],
  ['fetish', 'Klapsy'],
  ['experience', 'Klimat GFE'],
  ['fetish', 'Lateks'],
  ['oral', 'Lizanie jader'],
  ['massage', 'Masaz'],
  ['massage', 'Masaz GFE'],
  ['massage', 'Masaz Lingam'],
  ['massage', 'Masaz Yoni'],
  ['massage', 'Masaz body to body'],
  ['massage', 'Masaz ciazowy'],
  ['massage', 'Masaz duo'],
  ['massage', 'Masaz erotyczny dla kobiet'],
  ['massage', 'Masaz erotyczny dla mezczyzn'],
  ['massage', 'Masaz erotyczny dla par'],
  ['massage', 'Masaz klasyczny'],
  ['massage', 'Masaz lomi lomi'],
  ['massage', 'Masaz nuru'],
  ['massage', 'Masaz par'],
  ['massage', 'Masaz plecow'],
  ['massage', 'Masaz profesjonalny'],
  ['massage', 'Masaz prostaty'],
  ['massage', 'Masaz relaksacyjny'],
  ['massage', 'Masaz tantryczny'],
  ['oral', 'Minetka'],
  ['appearance', 'Mini spodniczki'],
  ['positions', 'Na jezdzca'],
  ['media', 'Nagrywanie video'],
  ['classic', 'Namietne pocalunki'],
  ['appearance', 'Nieogolone'],
  ['positions', 'Od tylu'],
  ['appearance', 'Ogolone'],
  ['fetish', 'Opluwanie'],
  ['fetish', 'Ostre slowka'],
  ['classic', 'Palcowka'],
  ['fetish', 'Pejcz'],
  ['fetish', 'Pissing'],
  ['classic', 'Pocalunki'],
  ['fetish', 'Podduszanie'],
  ['fetish', 'Policzkowanie'],
  ['experience', 'Pornstar Experience'],
  ['finish', 'Polyk'],
  ['appearance', 'Ponczochy'],
  ['privacy', 'Prywatnie'],
  ['roleplay', 'Przebrania/Kostiumy'],
  ['classic', 'Przytulanie'],
  ['oral', 'Rimming'],
  ['oral', 'Rimming aktywny'],
  ['oral', 'Rimming bierny'],
  ['media', 'Robienie zdjec'],
  ['roleplay', 'Role play'],
  ['positions', 'Rozne pozycje'],
  ['classic', 'Seks analny'],
  ['encounters', 'Seks grupowy'],
  ['oral', 'Seks oralny'],
  ['classic', 'Seks hiszpanski'],
  ['classic', 'Seks klasyczny'],
  ['classic', 'Seks z zabawkami'],
  ['appearance', 'Seksowna bielizna'],
  ['fetish', 'Skora'],
  ['massage', 'Spa'],
  ['time', 'Spotkanie calonocne'],
  ['experience', 'Spotkanie dla prawiczka'],
  ['encounters', 'Spotkanie z para'],
  ['finish', 'Squirt'],
  ['fetish', 'Strapon'],
  ['performance', 'Striptiz'],
  ['fetish', 'Szarpanie za wlosy'],
  ['appearance', 'Szpilki'],
  ['massage', 'Thai massage'],
  ['social', 'Towarzystwo'],
  ['fetish', 'Tresura'],
  ['fetish', 'Uleglosc'],
  ['events', 'Wieczor kawalerski'],
  ['fetish', 'Wiazanie'],
  ['time', 'Wiecej zblizen w godzinie'],
  ['classic', 'Wspolna kapiel'],
  ['social', 'Wspolne wyjazdy'],
  ['social', 'Wspolne wyjscia'],
  ['finish', 'Wytrysk'],
  ['classic', 'Wzajemna masturbacja'],
  ['fetish', 'Zgniatanie jader']
] as const;

export const serviceOptions: ServiceOption[] = labels.map(([category, label]) => ({
  key: serviceKey(label),
  label,
  category,
  is_active: true
}));

export const serviceLabelsByKey = Object.fromEntries(serviceOptions.map((service) => [service.key, service.label]));

export function serviceLabel(key: string) {
  return serviceLabelsByKey[key] || key;
}

function serviceKey(label: string) {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
