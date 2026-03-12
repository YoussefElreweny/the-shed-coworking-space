export interface Room {
  id: number;
  name: string;
  capacity: string;
  price: number;
  description: string;
  image_url: string;
}

export interface Booking {
  id: number;
  room_id: number;
  user_name: string;
  phone?: string;
  start_time: string;
  end_time: string;
}
