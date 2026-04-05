-- Insert hymns from the new hymnbook (Himnos para el hogar y la Iglesia)
-- that were added to the website after the initial seed (migration 0011).
-- Numbers 1052-1062 and 1210.

INSERT INTO hymns (number, title)
VALUES
  (1052, '¡Oh, qué gozo nos da!'),
  (1053, 'Mis convenios'),
  (1054, 'Al bautizarme a Cristo seguiré'),
  (1055, 'El poder del Santo Espíritu'),
  (1056, 'Elías y la suave voz'),
  (1057, 'Mi pastor es Cristo'),
  (1058, 'Mi canto en la noche'),
  (1059, 'El mundo es de Dios'),
  (1060, 'Un arca construiré'),
  (1061, 'Cuán dulce hogar de amor'),
  (1062, 'Nuestro ayuno, oh, Señor'),
  (1210, 'Tiempo atrás, en un jardín')
ON CONFLICT (number) DO NOTHING;

-- Set their external URLs
UPDATE hymns
SET external_url = v.url
FROM (VALUES
  (1052, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/joyfully-bound?lang=spa'),
  (1053, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/my-covenants?lang=spa'),
  (1054, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/when-i-am-baptized?lang=spa'),
  (1055, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/the-power-of-the-holy-ghost?lang=spa'),
  (1056, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/elijah-and-the-still-small-voice?lang=spa'),
  (1057, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/jesus-is-my-shepherd?lang=spa'),
  (1058, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/my-song-in-the-night?lang=spa'),
  (1059, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/this-is-my-fathers-world?lang=spa'),
  (1060, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/build-an-ark?lang=spa'),
  (1061, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/love-will-bless-our-home?lang=spa'),
  (1062, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/lord-accept-our-humble-fast?lang=spa'),
  (1210, 'https://www.churchofjesuschrist.org/study/music/hymns-for-home-and-church/long-ago-within-a-garden?lang=spa')
) AS v(num, url)
WHERE hymns.number = v.num
  AND (hymns.external_url IS NULL OR hymns.external_url = '');
