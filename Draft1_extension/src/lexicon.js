// Starter English → Spanish lexicon for "any video" mode.
// Types: n noun · v verb · a describing word · p people/pronoun · g glue · x name
// Only high-frequency words: these cover a large share of everyday speech.
window.DUET_LEXICON = (() => {
  const raw = `
n|time:tiempo day:día year:año people:gente man:hombre woman:mujer child:niño kid:niño world:mundo life:vida hand:mano
n|part:parte place:lugar case:caso week:semana work:trabajo home:casa house:casa way:camino thing:cosa things:cosas
n|water:agua food:comida money:dinero friend:amigo friends:amigos family:familia city:ciudad country:país school:escuela
n|night:noche morning:mañana name:nombre book:libro car:coche dog:perro cat:gato door:puerta room:cuarto heart:corazón
n|eyes:ojos head:cabeza love:amor music:música game:juego video:video question:pregunta problem:problema idea:idea
n|story:historia word:palabra words:palabras sun:sol moon:luna sky:cielo sea:mar fire:fuego light:luz blood:sangre
n|dragon:dragón king:rey war:guerra peace:paz power:poder voice:voz head:cabeza minute:minuto minutes:minutos hour:hora
n|phone:teléfono computer:computadora job:empleo team:equipo game:juego end:final beginning:principio party:fiesta
v|is:es are:son was:era be:ser have:tener has:tiene do:hacer does:hace go:ir going:yendo come:venir get:conseguir
v|make:hacer know:saber think:pensar take:tomar see:ver want:querer look:mirar use:usar find:encontrar give:dar
v|tell:decir say:decir said:dijo work:trabajar call:llamar try:intentar ask:preguntar need:necesitar feel:sentir
v|leave:dejar put:poner mean:significar keep:mantener let:dejar begin:empezar help:ayudar talk:hablar turn:girar
v|start:empezar show:mostrar hear:oír play:jugar run:correr move:mover live:vivir believe:creer bring:traer
v|happen:pasar write:escribir sit:sentarse stand:estar learn:aprender change:cambiar watch:mirar follow:seguir
v|stop:parar speak:hablar read:leer eat:comer love:amar like:gustar open:abrir walk:caminar win:ganar buy:comprar
v|wait:esperar remember:recordar can:puede will:va
a|good:bueno new:nuevo first:primero last:último long:largo great:gran little:pequeño small:pequeño big:grande
a|old:viejo right:correcto high:alto different:diferente important:importante bad:malo young:joven happy:feliz sad:triste
a|beautiful:hermoso easy:fácil hard:difícil fast:rápido slow:lento hot:caliente cold:frío dark:oscuro free:libre
a|very:muy really:realmente always:siempre never:nunca now:ahora today:hoy here:aquí there:allí again:otra_vez
a|still:todavía also:también only:solo just:solo together:juntos alone:solo maybe:quizás too:también well:bien
a|red:rojo blue:azul green:verde black:negro white:blanco best:mejor better:mejor more:más less:menos
p|i:yo you:tú he:él she:ella we:nosotros they:ellos me:me him:lo her:ella us:nos them:ellos my:mi your:tu
p|his:su our:nuestro their:su someone:alguien everyone:todos nobody:nadie something:algo nothing:nada everything:todo
p|this:esto that:eso what:qué who:quién
g|the:el a:un an:un and:y or:o but:pero if:si because:porque of:de to:a in:en on:en at:en for:para with:con
g|from:de about:sobre by:por as:como so:así not:no no:no yes:sí when:cuando where:dónde why:por_qué how:cómo
g|hello:hola hi:hola bye:adiós please:por_favor thanks:gracias okay:vale
`;
  const lex = {};
  for (const line of raw.trim().split('\n')) {
    const [t, list] = line.split('|');
    for (const pair of list.trim().split(/\s+/)) {
      const [en, es] = pair.split(':');
      if (!lex[en]) lex[en] = { es: es.replace(/_/g, ' '), t };
    }
  }
  return lex;
})();
