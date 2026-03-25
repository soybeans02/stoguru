import type { AppState, AppAction } from '../types/restaurant';

export function restaurantReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'LOAD_STATE':
      return action.payload;

    case 'ADD_RESTAURANT':
      return { ...state, restaurants: [...state.restaurants, action.payload] };

    case 'UPDATE_RESTAURANT':
      return {
        ...state,
        restaurants: state.restaurants.map((r) =>
          r.id === action.payload.id ? action.payload : r,
        ),
      };

    case 'DELETE_RESTAURANT':
      return {
        ...state,
        restaurants: state.restaurants.filter((r) => r.id !== action.payload.id),
      };

    case 'CHECKIN':
      return {
        ...state,
        restaurants: state.restaurants.map((r) =>
          r.id === action.payload.id
            ? { ...r, status: 'visited', visitedAt: action.payload.visitedAt, updatedAt: action.payload.visitedAt }
            : r,
        ),
      };

    case 'WRITE_REVIEW':
      return {
        ...state,
        restaurants: state.restaurants.map((r) =>
          r.id === action.payload.id
            ? { ...r, review: action.payload.review, status: 'visited', updatedAt: action.payload.review.reviewedAt }
            : r,
        ),
      };

    case 'ADD_CATEGORY':
      return { ...state, categories: [...state.categories, action.payload] };

    case 'UPDATE_CATEGORY':
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.payload.id ? action.payload : c,
        ),
      };

    case 'DELETE_CATEGORY':
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.payload.id),
        restaurants: state.restaurants.map((r) => ({
          ...r,
          categoryIds: r.categoryIds.filter((id) => id !== action.payload.id),
        })),
      };

    case 'ADD_INFLUENCER':
      return { ...state, influencers: [...state.influencers, action.payload] };

    case 'UPDATE_INFLUENCER':
      return {
        ...state,
        influencers: state.influencers.map((i) =>
          i.id === action.payload.id ? action.payload : i,
        ),
      };

    case 'DELETE_INFLUENCER':
      return {
        ...state,
        influencers: state.influencers.filter((i) => i.id !== action.payload.id),
        restaurants: state.restaurants.map((r) => ({
          ...r,
          influencerIds: r.influencerIds.filter((id) => id !== action.payload.id),
        })),
      };

    case 'REORDER_INFLUENCERS':
      return { ...state, influencers: action.payload };

    default:
      return state;
  }
}
