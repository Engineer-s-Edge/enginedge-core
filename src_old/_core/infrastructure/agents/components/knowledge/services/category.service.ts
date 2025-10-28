import { Injectable } from '@nestjs/common';
import { MyLogger } from '@core/services/logger/logger.service';

/**
 * Category Node for hierarchy
 */
interface CategoryNode {
  name: string;
  parent?: string;
  children: string[];
  relatedCategories: string[];
  keywords: string[];
  level: number; // 0 = root, 1 = top-level, 2+ = sub-categories
}

/**
 * Category Service
 * 
 * Manages category hierarchy and calculates distances between categories
 * to determine if two categories are "related" enough for Genius Agent to work on simultaneously
 */
@Injectable()
export class CategoryService {
  private categoryTree: Map<string, CategoryNode> = new Map();
  private initialized = false;

  constructor(private readonly logger: MyLogger) {}

  /**
   * Initialize the category tree
   * This should be called on application startup or when seeding
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing category tree', CategoryService.name);

    // Build a basic category hierarchy
    // This can be expanded by scraping Wikipedia's category tree later
    this.buildBasicHierarchy();

    this.initialized = true;
    this.logger.info('Category tree initialized', CategoryService.name);
  }

  /**
   * Build a basic category hierarchy
   * Based on major academic and professional domains
   */
  private buildBasicHierarchy(): void {
    // Root level
    this.addCategory('Knowledge', undefined, 0, []);

    // Top-level domains (Level 1)
    const topLevel = [
      { name: 'Natural Sciences', keywords: ['science', 'nature', 'physical'] },
      { name: 'Formal Sciences', keywords: ['mathematics', 'logic', 'statistics'] },
      { name: 'Social Sciences', keywords: ['society', 'human', 'culture'] },
      { name: 'Applied Sciences', keywords: ['technology', 'engineering', 'medicine'] },
      { name: 'Humanities', keywords: ['arts', 'literature', 'philosophy', 'history'] },
    ];

    topLevel.forEach(({ name, keywords }) => {
      this.addCategory(name, 'Knowledge', 1, keywords);
    });

    // Natural Sciences (Level 2)
    const naturalSciences = [
      'Physics',
      'Chemistry',
      'Biology',
      'Earth Sciences',
      'Astronomy',
      'Ecology',
    ];
    naturalSciences.forEach(name => {
      this.addCategory(name, 'Natural Sciences', 2, []);
      this.addRelation('Physics', 'Chemistry'); // Related sciences
      this.addRelation('Physics', 'Astronomy');
      this.addRelation('Biology', 'Chemistry');
      this.addRelation('Biology', 'Ecology');
      this.addRelation('Earth Sciences', 'Ecology');
    });

    // Formal Sciences (Level 2)
    const formalSciences = [
      'Mathematics',
      'Statistics',
      'Computer Science',
      'Logic',
      'Information Theory',
    ];
    formalSciences.forEach(name => {
      this.addCategory(name, 'Formal Sciences', 2, []);
      this.addRelation('Mathematics', 'Statistics');
      this.addRelation('Mathematics', 'Computer Science');
      this.addRelation('Computer Science', 'Information Theory');
    });

    // Social Sciences (Level 2)
    const socialSciences = [
      'Psychology',
      'Sociology',
      'Economics',
      'Political Science',
      'Anthropology',
      'Linguistics',
    ];
    socialSciences.forEach(name => {
      this.addCategory(name, 'Social Sciences', 2, []);
      this.addRelation('Psychology', 'Sociology');
      this.addRelation('Economics', 'Political Science');
      this.addRelation('Linguistics', 'Anthropology');
    });

    // Applied Sciences (Level 2)
    const appliedSciences = [
      'Engineering',
      'Medicine',
      'Agriculture',
      'Architecture',
      'Business',
    ];
    appliedSciences.forEach(name => {
      this.addCategory(name, 'Applied Sciences', 2, []);
      this.addRelation('Engineering', 'Architecture');
      this.addRelation('Medicine', 'Biology'); // Cross-domain relation
      this.addRelation('Agriculture', 'Biology');
    });

    // Humanities (Level 2)
    const humanities = [
      'Philosophy',
      'History',
      'Literature',
      'Arts',
      'Religion',
      'Ethics',
    ];
    humanities.forEach(name => {
      this.addCategory(name, 'Humanities', 2, []);
      this.addRelation('Philosophy', 'Ethics');
      this.addRelation('History', 'Literature');
    });

    // Add some interdisciplinary categories
    this.addCategory('Cognitive Science', 'Applied Sciences', 2, []);
    this.addRelation('Cognitive Science', 'Psychology');
    this.addRelation('Cognitive Science', 'Computer Science');
    this.addRelation('Cognitive Science', 'Linguistics');

    this.addCategory('Bioinformatics', 'Applied Sciences', 2, []);
    this.addRelation('Bioinformatics', 'Biology');
    this.addRelation('Bioinformatics', 'Computer Science');
  }

  /**
   * Add a category to the tree
   */
  private addCategory(
    name: string,
    parent: string | undefined,
    level: number,
    keywords: string[],
  ): void {
    if (!this.categoryTree.has(name)) {
      this.categoryTree.set(name, {
        name,
        parent,
        children: [],
        relatedCategories: [],
        keywords,
        level,
      });
    }

    // Update parent's children
    if (parent && this.categoryTree.has(parent)) {
      const parentNode = this.categoryTree.get(parent)!;
      if (!parentNode.children.includes(name)) {
        parentNode.children.push(name);
      }
    }
  }

  /**
   * Add a bidirectional relation between two categories
   */
  private addRelation(cat1: string, cat2: string): void {
    const node1 = this.categoryTree.get(cat1);
    const node2 = this.categoryTree.get(cat2);

    if (node1 && !node1.relatedCategories.includes(cat2)) {
      node1.relatedCategories.push(cat2);
    }
    if (node2 && !node2.relatedCategories.includes(cat1)) {
      node2.relatedCategories.push(cat1);
    }
  }

  /**
   * Calculate distance between two categories
   * 
   * @returns 
   *  0 = same category
   *  1 = parent-child or explicitly related
   *  2 = siblings (same parent)
   *  3 = cousins (same grandparent)
   *  4+ = distant
   */
  async calculateDistance(cat1: string, cat2: string): Promise<number> {
    await this.initialize();

    if (cat1 === cat2) return 0;

    const node1 = this.categoryTree.get(cat1);
    const node2 = this.categoryTree.get(cat2);

    if (!node1 || !node2) {
      // Unknown category, treat as distant
      return 999;
    }

    // Check if explicitly related
    if (node1.relatedCategories.includes(cat2)) {
      return 1;
    }

    // Check parent-child
    if (node1.parent === cat2 || node2.parent === cat1) {
      return 1;
    }

    // Check siblings (same parent)
    if (node1.parent && node1.parent === node2.parent) {
      return 2;
    }

    // Check cousins (same grandparent)
    const parent1 = node1.parent ? this.categoryTree.get(node1.parent) : null;
    const parent2 = node2.parent ? this.categoryTree.get(node2.parent) : null;

    if (
      parent1 &&
      parent2 &&
      parent1.parent &&
      parent1.parent === parent2.parent
    ) {
      return 3;
    }

    // Find shortest path using BFS
    const distance = this.findShortestPath(cat1, cat2);
    return distance ?? 999;
  }

  /**
   * BFS to find shortest path between two categories
   */
  private findShortestPath(start: string, end: string): number | null {
    const visited = new Set<string>();
    const queue: Array<{ category: string; distance: number }> = [
      { category: start, distance: 0 },
    ];

    while (queue.length > 0) {
      const { category, distance } = queue.shift()!;

      if (category === end) {
        return distance;
      }

      if (visited.has(category)) {
        continue;
      }
      visited.add(category);

      const node = this.categoryTree.get(category);
      if (!node) continue;

      // Add parent, children, and related categories to queue
      const neighbors = [
        ...(node.parent ? [node.parent] : []),
        ...node.children,
        ...node.relatedCategories,
      ];

      neighbors.forEach(neighbor => {
        if (!visited.has(neighbor)) {
          queue.push({ category: neighbor, distance: distance + 1 });
        }
      });
    }

    return null; // No path found
  }

  /**
   * Check if two categories are related (distance <= threshold)
   */
  async areRelated(
    cat1: string,
    cat2: string,
    threshold: number = 2,
  ): Promise<boolean> {
    const distance = await this.calculateDistance(cat1, cat2);
    return distance <= threshold;
  }

  /**
   * Get all categories
   */
  getAllCategories(): string[] {
    return Array.from(this.categoryTree.keys());
  }

  /**
   * Get category node
   */
  getCategory(name: string): CategoryNode | undefined {
    return this.categoryTree.get(name);
  }

  /**
   * Get children of a category
   */
  getChildren(name: string): string[] {
    const node = this.categoryTree.get(name);
    return node?.children || [];
  }

  /**
   * Get parent of a category
   */
  getParent(name: string): string | undefined {
    const node = this.categoryTree.get(name);
    return node?.parent;
  }

  /**
   * Get related categories
   */
  getRelated(name: string): string[] {
    const node = this.categoryTree.get(name);
    return node?.relatedCategories || [];
  }

  /**
   * Add a new category dynamically (for organic growth)
   */
  async addNewCategory(
    name: string,
    parent: string,
    relatedTo: string[] = [],
  ): Promise<void> {
    await this.initialize();

    const parentNode = this.categoryTree.get(parent);
    const level = parentNode ? parentNode.level + 1 : 2;

    this.addCategory(name, parent, level, []);

    relatedTo.forEach(related => {
      this.addRelation(name, related);
    });

    this.logger.info(
      `Added new category: ${name} under ${parent}`,
      CategoryService.name,
    );
  }

  /**
   * Get category distance (wrapper for calculateDistance)
   */
  getCategoryDistance(cat1: string, cat2: string): number {
    // Synchronous wrapper - use cached distance if possible
    const node1 = this.categoryTree.get(cat1);
    const node2 = this.categoryTree.get(cat2);

    if (!node1 || !node2) {
      return 999; // Unknown categories are very distant
    }

    if (cat1 === cat2) {
      return 0;
    }

    // Simple heuristic: Use BFS from Phase 2
    // For now, return the async version result (this should be called in async context)
    // In real implementation, pre-compute all distances or use a cache
    return this.calculateDistanceSync(cat1, cat2);
  }

  /**
   * Synchronous distance calculation (simplified)
   */
  private calculateDistanceSync(cat1: string, cat2: string): number {
    const node1 = this.categoryTree.get(cat1);
    const node2 = this.categoryTree.get(cat2);

    if (!node1 || !node2) return 999;
    if (cat1 === cat2) return 0;

    // Parent-child relationship
    if (node1.parent === cat2 || node2.parent === cat1) {
      return 1;
    }

    // Siblings
    if (node1.parent && node1.parent === node2.parent) {
      return 2;
    }

    // Related categories
    if (node1.relatedCategories.includes(cat2) || node2.relatedCategories.includes(cat1)) {
      return 3;
    }

    // BFS search
    const visited = new Set<string>();
    const queue: Array<{ category: string; distance: number }> = [{ category: cat1, distance: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      
      if (current.category === cat2) {
        return current.distance;
      }

      if (visited.has(current.category)) continue;
      visited.add(current.category);

      const node = this.categoryTree.get(current.category);
      if (!node) continue;

      // Add neighbors
      const neighbors = [
        ...node.children,
        ...(node.parent ? [node.parent] : []),
        ...node.relatedCategories,
      ];

      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ category: neighbor, distance: current.distance + 1 });
        }
      }
    }

    return 999; // No path found
  }
}
