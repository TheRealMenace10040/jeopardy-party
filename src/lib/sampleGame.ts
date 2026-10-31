import type { Board, Settings } from './types';

const clue = (text: string, response: string) => ({ text, response, image: null });

// Tester game, added from "Your games" with one click.
export const SAMPLE_TITLE = 'Tester game: fandoms and science';
export const SAMPLE_SETTINGS: Settings = { penalty: true, dailyDoubles: true };
export const SAMPLE_BOARD: Board = {
  categories: [
    {
      name: 'Percy Jackson',
      clues: [
        clue("Percy's father is this Greek god of the sea", 'Poseidon'),
        clue('Demigods train at this summer camp on Long Island', 'Camp Half-Blood'),
        clue("Percy's ballpoint pen turns into this bronze sword", 'Riptide (Anaklusmos)'),
        clue("Percy's best friend Grover is one of these half-goat creatures", 'A satyr'),
        clue("Annabeth Chase's mother is this goddess of wisdom", 'Athena'),
      ],
    },
    {
      name: 'Harry Potter',
      clues: [
        clue("Harry's snowy owl", 'Hedwig'),
        clue('The Sorting Hat puts Harry in this house', 'Gryffindor'),
        clue("This disarming spell is Harry's signature move", 'Expelliarmus'),
        clue("The Hogwarts Express leaves from this platform at King's Cross", 'Platform 9¾'),
        clue("The Weasley family's crooked home", 'The Burrow'),
      ],
    },
    {
      name: 'General anime',
      clues: [
        clue('This trainer from Pallet Town wants to be a Pokémon Master', 'Ash Ketchum'),
        clue('The rubber-bodied captain of the Straw Hat Pirates', 'Monkey D. Luffy'),
        clue('This studio made Spirited Away and My Neighbor Totoro', 'Studio Ghibli'),
        clue("Naruto's home, the Village Hidden in the Leaves, is also called this", 'Konoha'),
        clue('This apple-loving Shinigami drops the Death Note into the human world', 'Ryuk'),
      ],
    },
    {
      name: 'Video games',
      clues: [
        clue("Luigi's older brother, a plumber", 'Mario'),
        clue('In this block-building game, Creepers explode when they get close', 'Minecraft'),
        clue('The green-clad hero of The Legend of Zelda series', 'Link'),
        clue('This company makes the PlayStation', 'Sony'),
        clue('Tetris was created in 1984 in this country', 'The Soviet Union (USSR)'),
      ],
    },
    {
      name: 'Science',
      clues: [
        clue('H₂O is the chemical formula for this', 'Water'),
        clue('This planet is known as the Red Planet', 'Mars'),
        clue('Often called the powerhouse of the cell', 'The mitochondria'),
        clue('This form of carbon is the hardest natural material', 'Diamond'),
        clue('This uncharged particle sits in the nucleus alongside protons', 'The neutron'),
      ],
    },
  ],
  final: {
    category: 'Greek mythology',
    text: 'This Titan, father of Zeus, is the main villain of the first Percy Jackson series',
    response: 'Kronos (Cronus)',
    image: null,
  },
};
