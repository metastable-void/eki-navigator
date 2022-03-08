// vim: ts=2 sw=2 et ai
/*
  Eki Navigator
  Copyright (C) 2022 真空 et al.

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

const areaSelect = document.querySelector('#select-areas');
const lineSelect = document.querySelector('#select-lines');
browser.runtime.sendMessage({
  type: 'get_areas',
}).then((data) => {
  areaSelect.textContent = '';
  const option = document.createElement('option');
  option.value = '';
  option.textContent = '--';
  option.selected = true;
  areaSelect.append(option);
  for (const key of Reflect.ownKeys(data)) {
    const option = document.createElement('option');
    option.value = data[key];
    option.textContent = key;
    areaSelect.append(option);
  }
});

areaSelect.addEventListener('change', (ev) => {
  if (!areaSelect.value) {
    return;
  }
  browser.runtime.sendMessage({
    type: 'get_area_lines',
    areaUrl: areaSelect.value,
  }).then((data) => {
    lineSelect.textContent = '';
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '--';
    option.selected = true;
    lineSelect.append(option);
    for (const key of Reflect.ownKeys(data)) {
      const option = document.createElement('option');
      option.value = data[key];
      option.textContent = key;
      lineSelect.append(option);
    }
  });
});

const inputDate = document.querySelector('#input-date');
const buttonStart = document.querySelector('#button-start');

buttonStart.addEventListener('click', (ev) => {
  if (!lineSelect.value) {
    return;
  }
  if (!inputDate.value) {
    return;
  }
  const dt = inputDate.value.split('-').join('');
  browser.runtime.sendMessage({
    type: 'queue_fetch_line',
    lineUrl: lineSelect.value,
    dt,
  });
  alert('予約しました。');
});

